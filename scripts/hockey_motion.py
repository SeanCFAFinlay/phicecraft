"""First-party hockey poses, baked onto the portable GLB skeleton.

Two-bone IK keeps gloves on the shaft and skate blades close to the ice.
These are authored procedural clips, not motion-capture recordings.
"""
import math
import bpy
from mathutils import Vector, Matrix


def add_stick_bone(rig, goalie=False):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    bone = rig.data.edit_bones.new('stick')
    bone.head, bone.tail = (0, 0, 1.2 if goalie else 1.66), (0, 0, .04)
    bone.parent = rig.data.edit_bones['root']
    bpy.ops.object.mode_set(mode='OBJECT')


def author_motion(rig, goalie=False):
    rig.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    scene = bpy.context.scene
    scene.render.fps = 30

    def aim(name, head, tail):
        bone = rig.pose.bones[name]
        rest = rig.data.bones[name]
        rotation = (rest.tail_local - rest.head_local).rotation_difference(tail-head) @ rest.matrix_local.to_quaternion()
        bone.matrix = Matrix.LocRotScale(head, rotation, Vector((1,1,1)))
        bpy.context.view_layer.update()

    def limb(upper, lower, target, pole):
        a = rig.pose.bones[upper].head.copy()
        length_a, length_b = rig.data.bones[upper].length, rig.data.bones[lower].length
        offset = target-a
        distance = max(.001, min(offset.length, length_a+length_b-.001))
        axis = offset.normalized()
        bend = pole-a
        bend = (bend-axis*bend.dot(axis)).normalized()
        along = (length_a*length_a-length_b*length_b+distance*distance)/(2*distance)
        knee = a + axis*along + bend*math.sqrt(max(0,length_a*length_a-along*along))
        end = a+axis*distance
        aim(upper,a,knee)
        aim(lower,knee,end)
        return end

    def pose(kind, phase):
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
        pulse = math.sin(math.pi*phase)**2
        stride = math.sin(phase*math.tau)
        moving = kind in ('stride','skate')
        saving = kind == 'goalie_save'
        crouch = .11 + (.32*pulse if saving else .025*pulse if kind in ('recover','faceoff','stop') else 0)
        rig.pose.bones['hips'].location.y = -crouch
        if kind == 'goalie_shuffle':
            rig.pose.bones['hips'].location.x = .025*stride
        from mathutils import Euler
        rig.pose.bones['spine'].rotation_quaternion = Euler((.23,0,.05*stride if moving else 0)).to_quaternion()
        rig.pose.bones['chest'].rotation_quaternion = Euler((.1,0,.16*math.sin(math.tau*phase) if kind in ('pass','shot') else 0)).to_quaternion()
        rig.pose.bones['head'].rotation_quaternion = Euler((-.25,0,0)).to_quaternion()
        bpy.context.view_layer.update()

        for sign,suffix in [(1,'L'),(-1,'R')]:
            wave = stride*sign
            push = max(0,wave) if moving else 0
            lift = max(0,-wave)*.055 if moving else 0
            spread = .17 + push*.16 + (.22*pulse if saving else 0)
            ankle = Vector((sign*spread, .12*wave if moving else -.015, .12+lift))
            if kind == 'stop':
                ankle.y += sign*.08*pulse
            knee = Vector((sign*.22,-.4,.5))
            end = limb('thigh_'+suffix,'shin_'+suffix,ankle,knee)
            aim('foot_'+suffix,end,end+Vector((sign*.07*push,-.2,-.08)))

        grip = Vector((-.08,-.31,1.04-crouch*.2))
        # Right-handed simulation blade offset: 24.84 rink units forward,
        # 9 laterally, at 0.061 metres per unit. Local -Y exports as +Z.
        blade = Vector((-.549,-1.51524,.045))
        if kind in ('pass','shot','faceoff','recover','receive'):
            sweep = -math.sin(phase*math.tau)
            strength = .42 if kind == 'shot' else .23
            blade.x += strength*sweep
            grip.x += strength*.2*sweep
            grip.y -= .07*pulse
        if kind == 'turn':
            grip.x -= .08*pulse
            blade.x -= .16*pulse
        if goalie:
            grip = Vector((-.24,-.23,.88-crouch*.5))
            blade = Vector((-.12,-.65,.04))
        # The shaft has fixed length; its bottom stays at ice level.
        shaft = blade-grip
        shaft.normalize()
        shaft *= rig.data.bones['stick'].length
        aim('stick',grip,grip+shaft)
        grips = {'R': grip, 'L': grip+shaft*.27}
        for sign,suffix in [(1,'L'),(-1,'R')]:
            target = grips[suffix]
            if goalie and suffix == 'L':
                target = Vector((.38+.16*pulse,-.36,1.03-.22*pulse if saving else 1.03))
            shoulder = rig.pose.bones['upperarm_'+suffix].head.copy()
            hand_direction = (target-shoulder).normalized()
            wrist = target-hand_direction*.12
            end = limb('upperarm_'+suffix,'forearm_'+suffix,wrist,Vector((sign*.65,.02,1.0)))
            aim('hand_'+suffix,end,target)

    clips = [('goalie_idle',2),('goalie_shuffle',1),('goalie_save',1)] if goalie else [
        ('idle',2),('skate',1),('stride',1),('glide',1),('turn',1),('stop',.6),
        ('pass',.7),('shot',.9),('receive',.6),('recover',.7),('faceoff',.7)]
    for name,duration in clips:
        rig.animation_data_create()
        action=bpy.data.actions.new(name)
        action.use_fake_user=True
        rig.animation_data.action=action
        frames=max(2,round(duration*30))
        for frame in range(frames+1):
            scene.frame_set(frame+1)
            pose(name,frame/frames)
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame+1,group=bone.name)
                bone.keyframe_insert(data_path='location',frame=frame+1,group=bone.name)
        print('AUTHORED',name,frames+1,'frames')
    rig.animation_data.action=bpy.data.actions['goalie_idle' if goalie else 'idle']
    scene.frame_start=1
    scene.frame_end=61
    scene.frame_set(1)
