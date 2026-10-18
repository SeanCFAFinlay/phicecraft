"""Rebuild padded player anatomy on the original first-party skeletons and clips.

Run: blender --background --factory-startup --python scripts/refine-hockey-models.py
Optional: append -- --preview to render a close-up under output/playwright/models/.
The original .blend files remain the reproducible input; only runtime GLBs change.
"""
from pathlib import Path
import math
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
from hockey_body import rebuild_body
from hockey_motion import add_stick_bone, author_motion


def refine(name):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets-src/models' / f'{name}.blend'), load_ui=False, use_scripts=False)
    mesh = next(obj for obj in bpy.data.objects if obj.type == 'MESH')
    rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
    add_stick_bone(rig, goalie=name == 'hockey_goalie')
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    rebuild_body(mesh, goalie=name == 'hockey_goalie')
    author_motion(rig, goalie=name == 'hockey_goalie')

    # Eight-millimetre equipment edges catch light without inflating the rig.
    # Apply before the armature so the interpolated skin weights survive export.
    bevel = mesh.modifiers.new('Equipment edge detail', 'BEVEL')
    bevel.width = 0.008
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(35)
    bpy.ops.object.modifier_move_to_index(modifier=bevel.name, index=0)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    normals = mesh.modifiers.new('Weighted equipment normals', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    normals.weight = 50
    bpy.ops.object.modifier_move_to_index(modifier=normals.name, index=0)
    bpy.ops.object.modifier_apply(modifier=normals.name)
    mesh.data.validate(clean_customdata=True)
    mesh.data.update()

    # Distinct cloth, rubber, skin and steel responses, instead of one roughness.
    surfaces = {
        'jersey': (0.86, 0.0), 'accent': (0.8, 0.0), 'pants': (0.94, 0.0),
        'skin': (0.6, 0.0), 'white': (0.65, 0.0), 'dark': (0.42, 0.0),
        'steel': (0.24, 0.8), 'stick': (0.46, 0.15),
    }
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
        if shader and material.name in surfaces:
            roughness, metallic = surfaces[material.name]
            shader.inputs['Roughness'].default_value = roughness
            shader.inputs['Metallic'].default_value = metallic
            if material.name == 'stick':
                shader.inputs['Base Color'].default_value = (0.035, 0.045, 0.055, 1)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in {'MESH', 'ARMATURE'}:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(ROOT / 'public/assets/models' / f'{name}.glb'),
        export_format='GLB', use_selection=True, export_animations=True,
        export_animation_mode='ACTIONS', export_force_sampling=True,
        export_skins=True, export_yup=True,
    )
    print(f'REFINED {name}: {len(mesh.data.vertices)} vertices, {len(mesh.data.polygons)} faces')

    if '--preview' in sys.argv:
        scene = bpy.context.scene
        scene.frame_set(1)
        bpy.ops.mesh.primitive_plane_add(size=200)
        floor = bpy.context.object
        floor_mat = bpy.data.materials.new('Preview ice')
        floor_mat.diffuse_color = (0.55, 0.65, 0.72, 1)
        floor.data.materials.append(floor_mat)
        bpy.ops.object.camera_add(location=(3.0, -4.8, 2.5))
        scene.camera = bpy.context.object
        scene.camera.rotation_euler = (Vector((0, 0, 0.95)) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.camera.data.lens = 65
        for position, power, size in [((2, -3, 5), 700, 4), ((-3, 1, 3), 450, 3)]:
            bpy.ops.object.light_add(type='AREA', location=position)
            light = bpy.context.object
            light.data.energy = power
            light.data.shape = 'DISK'
            light.data.size = size
            light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.world.color = (0.25, 0.25, 0.25)
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 600
        scene.render.resolution_y = 600
        scene.render.resolution_percentage = 100
        target = ROOT / 'output/playwright/models'
        target.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(target / f'{name}.png')
        bpy.ops.render.render(write_still=True)


for model in ['hockey_player', 'hockey_goalie']:
    refine(model)
