"""Procedural padded hockey anatomy fitted to the original first-party rig."""
import math
import bpy
import bmesh
from mathutils import Vector


TORSO = ((0, 0, 0.94), (0, 0, 1.49), [
    (0, .19, .135), (.08, .20, .14), (.3, .19, .135),
    (.58, .23, .155), (.8, .255, .16), (.92, .22, .14), (1, .11, .085),
])
SHIN_TOP, SHIN_BOTTOM = .66, .12
SHIN_RINGS = [(0, .075, .085), (.28, .085, .095), (.5, .08, .09), (.85, .055, .065), (1, .05, .05)]


def ring_at(rings, fraction):
    """Radii of a profile at `fraction` along it, linearly between its rings."""
    fraction = max(rings[0][0], min(rings[-1][0], fraction))
    for (f0, a0, b0), (f1, a1, b1) in zip(rings, rings[1:]):
        if f0 <= fraction <= f1:
            t = 0 if f1 == f0 else (fraction - f0) / (f1 - f0)
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return rings[-1][1], rings[-1][2]


def torso_radii(z):
    (_, _, z0), (_, _, z1), rings = TORSO
    return ring_at(rings, (z - z0) / (z1 - z0))


def torso_weights(z):
    """The torso's own hips/spine/chest blend, so anything printed on it bends with it."""
    if z < 1.12:
        blend = max(0, min(1, (z - 1.0) / .12))
        return {'hips': 1 - blend, 'spine': blend}
    blend = max(0, min(1, (z - 1.12) / .22))
    return {'spine': 1 - blend, 'chest': blend}


def shin_radii(z):
    return ring_at(SHIN_RINGS, (SHIN_TOP - z) / (SHIN_TOP - SHIN_BOTTOM))


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

    def band(z0, z1, radii, bone, material, offset, segments=28, x=0.0, y=0.0):
        """A garment stripe that hugs the surface underneath it, `offset` proud of it."""
        offsets = offset if isinstance(offset, tuple) else (offset, offset, offset)
        rings = []
        for fraction, lift in zip((0, .5, 1), offsets):
            a, b = radii(z0 + (z1 - z0) * fraction)
            rings.append((fraction, a + lift, b + lift))
        return profile((x, y, z0), (x, y, z1), rings, bone, material, segments)

    def sleeve_band(sign, start, end, rings, f0, f1, bone, material, offset=.004):
        """A stripe around an arm, fitted to that arm's own profile."""
        a0, b0 = ring_at(rings, f0)
        a1, b1 = ring_at(rings, f1)
        p0 = start + (end - start) * f0
        p1 = start + (end - start) * f1
        return profile((sign*p0, 0, 1.44), (sign*p1, 0, 1.44),
                       [(0, a0 + offset, b0 + offset), (1, a1 + offset, b1 + offset)], bone, material)

    def curved_patch(name, columns, rows, point_at, weights_at, material):
        """A UV-mapped sheet: u runs across (0..1), v runs up (0..1)."""
        vertices, faces, uvs = [], [], []
        for row in range(rows + 1):
            for column in range(columns + 1):
                vertices.append(point_at(column / columns, row / rows))
        for row in range(rows):
            for column in range(columns):
                i = row * (columns + 1) + column
                faces.append((i, i + 1, i + columns + 2, i + columns + 1))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        layer = mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                vertex = mesh.loops[loop_index].vertex_index
                row, column = divmod(vertex, columns + 1)
                layer.data[loop_index].uv = (column / columns, row / rows)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(bpy.data.materials[material])
        for poly in obj.data.polygons:
            poly.use_smooth = True
        groups = {}
        for vertex in obj.data.vertices:
            for bone, weight in weights_at(vertex.co).items():
                if bone not in groups:
                    groups[bone] = obj.vertex_groups.new(name=bone)
                groups[bone].add([vertex.index], weight, 'REPLACE')
        parts.append(obj)
        return obj

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
    torso = profile(*TORSO, 'chest', 'jersey', 28)
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
    # Hem stripes, accent / white / accent, the way a real sweater is trimmed.
    band(.955, 1.025, torso_radii, 'hips', 'accent', .004)
    band(.98, 1.0, torso_radii, 'hips', 'white', .007)
    # Collar.
    band(1.455, 1.488, torso_radii, 'chest', 'accent', .006)

    # The back number panel. It is printed per player at runtime (a canvas
    # texture on the `number` material), so one model serves every roster.
    # It follows the torso's own curve and its own bone weights, 5 mm proud.
    back_centre = -math.pi / 2  # profile angle facing +Y, i.e. the player's back
    half_width = .66

    def back_point(u, v):
        z = 1.15 + .25 * v
        a, b = torso_radii(z)
        angle = back_centre - half_width + 2 * half_width * u
        lift = .042 if goalie else .005  # clear of the goalie's chest protector
        return Vector((-math.cos(angle) * (a + lift), -math.sin(angle) * (b + lift), z))

    curved_patch('Back number', 10, 6, back_point, lambda co: torso_weights(co.z), 'number')
    if goalie:
        # Chest protector and arm pads make the goalie read as a goalie at a glance.
        # Tapered: flush at the waist, fullest across the chest.
        band(1.06, 1.44, torso_radii, 'chest', 'jersey', (.004, .036, .03), 28)
        for side in [-1, 1]:
            sphere((side*.24, 0, 1.445), (.15, .16, .145), 'chest', 'jersey')
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
    if goalie:
        for z in [1.60,1.64,1.68,1.72]:
            profile((-.085,-.116,z),(.085,-.116,z),[(0,.003,.003),(1,.003,.003)],'head','steel',8)
    else:
        # A clear half visor from the brow to below the eyes, clear of the nose.
        def visor_point(u, v):
            z = 1.615 + .08 * v
            depth = .142 - .014 * v
            angle = math.pi / 2 - 1.1 + 2.2 * u
            return Vector((-math.cos(angle) * .116, -.006 - math.sin(angle) * depth, z))

        curved_patch('Visor', 12, 3, visor_point, lambda co: {'head': 1.0}, 'visor')
        profile((-.105,-.11,1.697),(.105,-.11,1.697),[(0,.006,.006),(1,.006,.006)],'head','dark',8)
    if goalie:
        for x in [-.06,0,.06]:
            profile((x,-.119,1.58),(x,-.119,1.73),[(0,.003,.003),(1,.003,.003)],'head','steel',8)
    else:
        for x in [-.085,.085]:
            profile((x,-.04,1.61),(x,.035,1.66),[(0,.006,.006),(1,.006,.006)],'head','dark',8)

    for sign, suffix in [(1,'L'),(-1,'R')]:
        upper, forearm, hand = f'upperarm_{suffix}', f'forearm_{suffix}', f'hand_{suffix}'
        sphere((sign*.23,0,1.43),(.13,.14,.135),upper,'jersey')
        upper_rings = [(0,.11,.12),(.35,.115,.12),(.8,.09,.09),(1,.075,.08)]
        fore_rings = [(0,.08,.085),(.25,.085,.09),(.8,.065,.065),(1,.06,.06)]
        profile((sign*.20,0,1.44),(sign*.45,0,1.44),upper_rings,upper,'jersey')
        profile((sign*.43,0,1.44),(sign*.66,0,1.44),fore_rings,forearm,'jersey')
        # Shoulder yoke and elbow stripes: accent / white / accent.
        sleeve_band(sign, .20, .45, upper_rings, .3, .42, upper, 'accent')
        sleeve_band(sign, .43, .66, fore_rings, .3, .56, forearm, 'accent')
        sleeve_band(sign, .43, .66, fore_rings, .39, .47, forearm, 'white', .007)
        sphere((sign*.705,0,1.44),(.085,.072,.062),hand,'dark' if goalie else 'jersey')
        profile((sign*.645,0,1.44),(sign*.675,0,1.44),[(0,.077,.077),(1,.077,.077)],hand,'accent')
        if goalie and suffix == 'L':
            sphere((sign*.74,-.015,1.44),(.14,.075,.125),hand,'white')
            sphere((sign*.75,-.07,1.44),(.09,.015,.08),hand,'dark')
        elif goalie:
            box((sign*.73,-.06,1.44),(.21,.065,.28),.025,hand,'white')
        else:
            for knuckle in range(4):
                box((sign*.73,-.032+(knuckle*.02),1.48),(.065,.017,.026),.007,hand,'accent')

        thigh, shin, foot = f'thigh_{suffix}', f'shin_{suffix}', f'foot_{suffix}'
        x = sign*.11
        profile((x,0,.97),(x,0,.63),[(0,.115,.145),(.3,.125,.145),(.85,.105,.12),(1,.10,.115)],thigh,'pants')
        # Socks in the team colour, striped white / accent / white.
        profile((x,0,SHIN_TOP),(x,0,SHIN_BOTTOM),SHIN_RINGS,shin,'jersey')
        band(.30, .32, shin_radii, shin, 'white', .004, 20, x)
        band(.335, .375, shin_radii, shin, 'accent', .004, 20, x)
        band(.39, .41, shin_radii, shin, 'white', .004, 20, x)
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
