# Blender Python script - Run in Blender's Text Editor
# Converts curves to mesh, exports vertices, then deletes the temp mesh
# Also exports waypoints (objects starting with "wp")

import bpy
import json
import statistics

# Always save to this folder
OUTPUT_PATH = "C:/Users/rahul/Documents/prog/html/zach/mesh_paths.json"
WAYPOINTS_PATH = "C:/Users/rahul/Documents/prog/html/zach/waypoints.json"

# Dictionary to store all path points
path_data = {}

# First pass: collect all Z heights from curves
all_heights = []

for obj in bpy.data.objects:
    if obj.type == 'CURVE' and '-' in obj.name:
        world_matrix = obj.matrix_world
        for spline in obj.data.splines:
            for point in spline.points:
                world_co = world_matrix @ point.co
                all_heights.append(world_co.z)
            for point in spline.bezier_points:
                world_co = world_matrix @ point.co
                all_heights.append(world_co.z)

# Get median height
median_height = statistics.median(all_heights) if all_heights else 0
print(f"Median height (Blender Z): {median_height}")

# Second pass: convert to mesh and export vertices
for obj in bpy.data.objects:
    if obj.type == 'CURVE' and '-' in obj.name:
        curve_name = obj.name
        world_matrix = obj.matrix_world

        # Create a temporary mesh from the curve
        depsgraph = bpy.context.evaluated_depsgraph_get()
        obj_eval = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(obj_eval)

        if mesh is None or len(mesh.vertices) == 0:
            print(f"Skipping {curve_name}: no mesh data")
            continue

        points = []

        # Get vertices from the mesh
        for vert in mesh.vertices:
            world_co = world_matrix @ vert.co
            # Convert Blender coords (Z-up) to Three.js coords (Y-up)
            points.append([
                world_co.x,
                median_height,  # Use median height for all points
                -world_co.y
            ])

        # Clean up temp mesh
        bpy.data.meshes.remove(mesh)

        if poin
            path_data[curve_name] = points
            print(f"Exported {curve_name}: {len(points)} vertices")

with open(OUTPUT_PATH, 'w') as f:
    json.dump(path_data, f, indent=2)

print(f"\nExported {len(path_data)} paths to: {OUTPUT_PATH}")
print("Path names:", list(path_data.keys()))

# Export waypoints (objects starting with "wp")
waypoints = {}

for obj in bpy.data.objects:
    if obj.name.lower().startswith('wp'):
        world_co = obj.matrix_world.translation
        # Convert Blender coords (Z-up) to Three.js coords (Y-up)
        waypoints[obj.name] = [
            world_co.x,
            median_height,  # Use same median height as paths
            -world_co.y
        ]
        print(f"Exported waypoint {obj.name}: {waypoints[obj.name]}")

with open(WAYPOINTS_PATH, 'w') as f:
    json.dump(waypoints, f, indent=2)

print(f"\nExported {len(waypoints)} waypoints to: {WAYPOINTS_PATH}")
