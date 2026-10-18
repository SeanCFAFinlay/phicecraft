"""Procedural padded hockey anatomy fitted to the original first-party rig."""
import math
import bpy
import bmesh
from mathutils import Vector


def rebuild_body(original, goalie=False):
    parts = []

    def finish(obj, bone, material):
        obj.data.materials.clear()
        obj.data.materials.append(bpy.data.materials[material])
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        for poly in obj.data.polygons:
            poly.use_smooth = True
        parts.append(obj)
        return obj

    def sphere(center, scale, bone, material, segments=20, rings=12):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
        obj = bpy.context.object
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return finish(obj, bone, material)

    def box(center, dimensions, radius, bone, material):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        obj = bpy.context.object
        obj.scale = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = obj.modifiers.new('Rounded padding', 'BEVEL')
        bevel.width = radius
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        normal = obj.modifiers.new('Panel normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
        return finish(obj, bone, material)

    def profile(start, end, rings, bone, material, segments=20):
        start, end = Vector(start), Vector(end)
        direction = (end - start).normalized()
        side = direction.cross(Vector((0, 1, 0))).normalized()
        other = direction.cross(side).normalized()
        vertices, faces = [], []
        for fraction, radius_a, radius_b in rings:
            center = start.lerp(end, fraction)
            for index in range(segments):
                angle = index * math.tau / segments
                vertices.append(center + side * (math.cos(angle) * radius_a) + other * (math.sin(angle) * radius_b))
        for ring in range(len(rings) - 1):
            for index in range(segments):
                nxt = (index + 1) % segments
                faces.append((ring*segments+index, ring*segments+nxt, (ring+1)*segments+nxt, (ring+1)*segments+index))
        faces.extend([tuple(reversed(range(segments))), tuple((len(rings)-1)*segments+i for i in range(segments))])
        mesh = bpy.data.meshes.new('Tailored equipment')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new('Tailored equipment', mesh)
        bpy.context.collection.objects.link(obj)
        return finish(obj, bone, material)

    # Rebuild the body and a separate rigid stick controlled by the motion rig.
    bm = bmesh.new()
    bm.from_mesh(original.data)
    bmesh.ops.delete(bm, geom=list(bm.faces), context='FACES')
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
    bm.to_mesh(original.data)
    bm.free()

    stick_top = 1.2 if goalie else 1.66
    box((0,0,(stick_top+.04)/2),(.022,.025,stick_top-.04),.004,'stick','stick')
    box((.1,0,.045),(.23,.025,.065),.008,'stick','dark')
    for z in [stick_top-.07,stick_top-.05,stick_top-.03]:
        box((0,0,z),(.026,.029,.012),.002,'stick','white')

    # Fitted jersey: padded shoulders, a tapered waist, and a loose lower hem.
    torso = profile((0, 0, 0.94), (0, 0, 1.49), [
        (0, .19, .135), (.08, .20, .14), (.3, .19, .135),
        (.58, .23, .155), (.8, .255, .16), (.92, .22, .14), (1, .11, .085),
    ], 'chest', 'jersey', 28)
    torso.vertex_groups.clear()
    for bone in ['hips', 'spine', 'chest']:
        torso.vertex_groups.new(name=bone)
    for vertex in torso.data.vertices:
        z = vertex.co.z
        if z < 1.12:
            blend = max(0, min(1, (z - 1.0) / .12))
            names = ('hips', 'spine')
        else:
            blend = max(0, min(1, (z - 1.12) / .22))
            names = ('spine', 'chest')
        torso.vertex_groups[names[0]].add([vertex.index], 1-blend, 'REPLACE')
        torso.vertex_groups[names[1]].add([vertex.index], blend, 'REPLACE')
    profile((0, 0, .965), (0, 0, 1.015), [(0,.202,.142),(1,.203,.143)], 'hips', 'accent', 28)
    sphere((0, 0, 1.50), (.055, .055, .09), 'neck', 'skin')
    sphere((0, -.008, 1.655), (.088, .093, .126), 'head', 'skin')
    sphere((0, -.097, 1.653), (.021, .025, .035), 'head', 'skin', 12, 8)
    for side in [-1, 1]:
        sphere((side*.035, -.092, 1.69), (.012, .009, .006), 'head', 'dark', 12, 8)
    # Layered shell leaves the face visible beneath the brow instead of using
    # a coloured ball for the whole head.
    profile((0, .006, 1.682), (0, .006, 1.813), [
        (0,.105,.12),(.2,.111,.128),(.55,.102,.119),(.85,.07,.085),(1,.015,.025),
    ], 'head', 'white' if goalie else 'dark', 28)
    for side in [-1, 1]:
        sphere((side*.099, .01, 1.66), (.019,.055,.065), 'head', 'white' if goalie else 'dark', 16, 10)
    # Protective cage bars and a subtle brow: visible anatomy stays readable.
    for z in ([1.60,1.64,1.68,1.72] if goalie else [1.685]):
        profile((-.085,-.116,z),(.085,-.116,z),[(0,.003,.003),(1,.003,.003)],'head','steel',8)
    if goalie:
        for x in [-.06,0,.06]:
            profile((x,-.119,1.58),(x,-.119,1.73),[(0,.003,.003),(1,.003,.003)],'head','steel',8)
    else:
        for x in [-.085,.085]:
            profile((x,-.04,1.61),(x,.035,1.66),[(0,.006,.006),(1,.006,.006)],'head','dark',8)

    for sign, suffix in [(1,'L'),(-1,'R')]:
        upper, forearm, hand = f'upperarm_{suffix}', f'forearm_{suffix}', f'hand_{suffix}'
        sphere((sign*.23,0,1.43),(.13,.14,.135),upper,'jersey')
        profile((sign*.20,0,1.44),(sign*.45,0,1.44),[(0,.11,.12),(.35,.115,.12),(.8,.09,.09),(1,.075,.08)],upper,'jersey')
        profile((sign*.43,0,1.44),(sign*.66,0,1.44),[(0,.08,.085),(.25,.085,.09),(.8,.065,.065),(1,.06,.06)],forearm,'jersey')
        profile((sign*.51,0,1.44),(sign*.55,0,1.44),[(0,.081,.087),(1,.077,.083)],forearm,'accent')
        sphere((sign*.705,0,1.44),(.085,.072,.062),hand,'dark')
        profile((sign*.645,0,1.44),(sign*.675,0,1.44),[(0,.077,.077),(1,.077,.077)],hand,'accent')
        if goalie and suffix == 'L':
            sphere((sign*.74,-.015,1.44),(.14,.075,.125),hand,'white')
            sphere((sign*.75,-.07,1.44),(.09,.015,.08),hand,'dark')
        elif goalie:
            box((sign*.73,-.06,1.44),(.21,.065,.28),.025,hand,'white')
        else:
            for knuckle in range(4):
                box((sign*.73,-.032+(knuckle*.02),1.48),(.065,.017,.026),.007,hand,'jersey')

        thigh, shin, foot = f'thigh_{suffix}', f'shin_{suffix}', f'foot_{suffix}'
        x = sign*.11
        profile((x,0,.97),(x,0,.63),[(0,.115,.145),(.3,.125,.145),(.85,.105,.12),(1,.10,.115)],thigh,'pants')
        profile((x,0,.66),(x,0,.12),[(0,.075,.085),(.28,.085,.095),(.5,.08,.09),(.85,.055,.065),(1,.05,.05)],shin,'white')
        for z in [.33,.39]:
            profile((x,0,z),(x,0,z+.025),[(0,.074,.086),(1,.075,.087)],shin,'jersey')
        if goalie:
            box((x,-.105,.40),(.22,.16,.60),.035,shin,'white')
            for z in [.23,.39,.55]:
                box((x,-.19,z),(.19,.014,.025),.006,shin,'accent')
        box((x,-.06,.11),(.12,.29,.16),.025,foot,'dark')
        box((x,-.07,.045),(.115,.30,.028),.008,foot,'white')
        box((x,-.075,.018),(.009,.31,.026),.006,foot,'steel')
        for y in [-.13,-.095,-.06]:
            box((x,y,.192),(.075,.008,.008),.003,foot,'white')

    # One skinned mesh keeps the draw-call count at the existing material count.
    bpy.ops.object.select_all(action='DESELECT')
    original.select_set(True)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = original
    bpy.ops.object.join()
    original.data.validate(clean_customdata=True)
    original.data.update()
    return original
