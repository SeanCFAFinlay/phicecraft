"""Rebuild padded player anatomy on the original first-party skeletons and clips.

Run: blender --background --factory-startup --python scripts/refine-hockey-models.py
Optional: append -- --preview to render a close-up under output/playwright/models/.
Afterwards the exports are packed by scripts/compress-models.mjs (run here, or
by hand with `npm run models:compress`).
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


def ensure_material(name, color, alpha):
    """A material the original .blend predates. Alpha < 1 exports as glTF BLEND."""
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if hasattr(material, 'use_nodes'):
        try:
            material.use_nodes = True
        except Exception:
            pass
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Alpha'].default_value = alpha
    if hasattr(material, 'surface_render_method'):
        material.surface_render_method = 'BLENDED'
    material.use_backface_culling = False
    return material


def refine(name):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets-src/models' / f'{name}.blend'), load_ui=False, use_scripts=False)
    mesh = next(obj for obj in bpy.data.objects if obj.type == 'MESH')
    rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
    add_stick_bone(rig, goalie=name == 'hockey_goalie')
    # `number` is invisible until the renderer prints a player's number on it.
    ensure_material('number', (1, 1, 1, 1), 0.0)
    ensure_material('visor', (0.78, 0.88, 0.96, 1), 0.32)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    rebuild_body(mesh, goalie=name == 'hockey_goalie')
    author_motion(rig, goalie=name == 'hockey_goalie')

    # The body builder shapes every part from smooth lofts with its own hard
    # edges (see hockey_body.py), so no blanket bevel pass is needed here.
    mesh.data.validate(clean_customdata=True)
    mesh.data.update()

    # Distinct cloth, rubber, skin and steel responses, instead of one roughness.
    surfaces = {
        'jersey': (0.82, 0.0), 'accent': (0.78, 0.0), 'pants': (0.88, 0.0),
        'skin': (0.55, 0.0), 'white': (0.5, 0.0), 'dark': (0.3, 0.0),
        'steel': (0.2, 0.9), 'stick': (0.38, 0.1),
        'number': (0.8, 0.0), 'visor': (0.05, 0.0),
    }
    colours = {
        'skin': (0.78, 0.55, 0.42, 1), 'dark': (0.035, 0.038, 0.045, 1),
        'white': (0.9, 0.91, 0.92, 1), 'steel': (0.78, 0.8, 0.83, 1),
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
            if material.name in colours:
                shader.inputs['Base Color'].default_value = colours[material.name]

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
        scene.cycles.samples = 16
        poses = ['goalie_idle', 'goalie_save'] if name == 'hockey_goalie' else ['idle', 'stride', 'shot']
        views = {
            'front': ((3.0, -4.8, 2.5), (0, 0, 0.95), 65),
            'back': ((-2.6, 4.9, 2.3), (0, 0, 0.95), 65),
            'face': ((0.55, -1.25, 1.75), (0, -0.25, 1.55), 85),
            'skate': ((0.9, -1.1, 0.45), (0, -0.25, 0.2), 70),
        }
        for pose_name in poses:
            action = bpy.data.actions.get(pose_name)
            if action is None:
                continue
            rig.animation_data.action = action
            if hasattr(rig.animation_data, 'action_slot') and action.slots:
                rig.animation_data.action_slot = action.slots[0]
            start, end = action.frame_range
            scene.frame_set(int(start + (end - start) * 0.5))
            for view, (location, aim, lens) in views.items():
                if view in ('face', 'skate') and pose_name != poses[0]:
                    continue
                scene.camera.location = location
                scene.camera.data.lens = lens
                scene.camera.rotation_euler = (Vector(aim) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
                scene.render.filepath = str(target / f'{name}-{pose_name}-{view}.png')
                bpy.ops.render.render(write_still=True)


for model in ['hockey_player', 'hockey_goalie']:
    refine(model)

import subprocess
subprocess.run(['node', str(ROOT / 'scripts/compress-models.mjs')], check=True)
