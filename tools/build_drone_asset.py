"""Regenerates assets/drone/drone.bin + drone.json for the hero intro from the drone STEP file.
Usage (from the site folder):  python tools/build_drone_asset.py "path/to/Mohammed_0.1 Full Shell.step"
Needs build123d. Axis / split radii / nose offset are tuned to "Mohammed_0.1 Full Shell"."""
from build123d import *
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.TopAbs import TopAbs_REVERSED
import numpy as np, json, math, struct

CX, CY, Z0 = 679.7, 23.5, 1346.0
NOSE_SHIFT = -82.0
import sys
c = import_step(sys.argv[1] if len(sys.argv) > 1 else "drone.step")
tail = c.children[0]; shells = c.children[1].shells()
nose = Solid(shells[0]); sensor = Solid(shells[1])
import sys
STEP = sys.argv[1] if len(sys.argv) > 1 else "drone.step"
mid = Solid(shells[2])
core = Pos(CX, CY, 1280) * Cylinder(36.5, 160, align=(Align.CENTER, Align.CENTER, Align.MIN))
fus = mid & core; wings = mid - core
cyl = Pos(CX, CY, 1280) * Cylinder(90, 160, align=(Align.CENTER, Align.CENTER, Align.MIN))
winners = (wings & cyl).solids(); nacs = (wings - cyl).solids()

def ang(s):
    bb = s.bounding_box(); return math.degrees(math.atan2(bb.center().Y-CY, bb.center().X-CX)) % 360
# --- internal components: simplified placeholders (not in the shell STEP) -------------------
# FC board lies along the axis (board plane = x/z), mount plate below it, battery pack in the
# tail tube. Replace with real geometry (e.g. import_step of the mount) when available.
def at(zc): return Pos(CX, CY, zc)
FC_Z, BAT_Z = Z0 + 22, Z0 - 42
fc_mount = at(FC_Z) * Pos(0, -9, 0) * Box(34, 2.4, 40)                     # base plate
for sx in (-15.25, 15.25):
    for sz in (-15.25, 15.25):
        fc_mount += at(FC_Z) * Pos(sx, -4.2, sz) * Rot(90, 0, 0) * Cylinder(1.8, 7.2)   # standoffs (30.5 pattern)
for sz in (-18.5, 18.5):                                                      # clamp rings against the wall
    ring = at(FC_Z + sz) * (Cylinder(26.5, 3) - Cylinder(24.0, 3))
    fc_mount += ring & (at(FC_Z + sz) * Pos(0, -14, 0) * Box(60, 28, 3))
fc = at(FC_Z) * Pos(0, 0.6, 0) * Box(30, 5.6, 30)                            # flight controller block
fc = fc.fillet(0.8, fc.edges().filter_by(Axis.Y))
bat = at(BAT_Z) * Box(23, 23, 64)
bat = bat.fillet(2.5, bat.edges().filter_by(Axis.Z))
bat += at(BAT_Z + 32) * Pos(6, 6, 6) * Cylinder(1.4, 12)                      # lead

parts = [("nose", nose, NOSE_SHIFT), ("fuselage", fus, 0), ("tail", tail, 0),
         ("fcmount", fc_mount, 0), ("fc", fc, 0), ("battery", bat, 0)]
for s in sorted(winners, key=ang): parts.append(("wing%d" % (round(ang(s)) // 90), s, 0))
for s in sorted(nacs, key=ang): parts.append(("nacelle%d" % (round(ang(s)) // 90), s, 0))

def mesh(shape, dz, tol=0.15):
    BRepMesh_IncrementalMesh(shape.wrapped, tol, False, 0.25, True)
    V = []; T = []
    for f in shape.faces():
        loc = TopLoc_Location(); tri = BRep_Tool.Triangulation_s(f.wrapped, loc)
        if tri is None: continue
        tr = loc.Transformation(); base = len(V)
        for i in range(1, tri.NbNodes()+1):
            p = tri.Node(i).Transformed(tr); V.append((p.X()-CX, p.Y()-CY, p.Z()-Z0+dz))
        rev = f.wrapped.Orientation() == TopAbs_REVERSED
        for i in range(1, tri.NbTriangles()+1):
            a, b, cc = tri.Triangle(i).Get()
            if rev: b, cc = cc, b
            T.append((base+a-1, base+b-1, base+cc-1))
    return np.array(V), np.array(T, dtype=np.int64)

def cad_edges(shape, dz):
    out = []
    for e in shape.edges():
        try:
            L = e.length
            if L < 0.4: continue
            n = 2 if e.geom_type.name == 'LINE' else max(3, min(120, int(L/1.2)+2))
            pts = [e.position_at(i/(n-1)) for i in range(n)]
        except Exception: continue
        out.append(np.array([(p.X-CX, p.Y-CY, p.Z-Z0+dz) for p in pts]))
    return out

def slice_mesh(V, T, fvals):
    """fvals: signed distance per vertex; returns list of segments (2x3)"""
    f = fvals[T]                       # (n,3)
    s = np.sign(f); s[s == 0] = 1e-9
    segs = []
    pa = V[T]                          # (n,3,3)
    cross = []
    for (i, j) in ((0, 1), (1, 2), (2, 0)):
        fi, fj = f[:, i], f[:, j]
        m = (fi * fj) < 0
        t = np.where(m, fi / np.where(m, fi - fj, 1), 0)
        p = pa[:, i] + (pa[:, j] - pa[:, i]) * t[:, None]
        cross.append((m, p))
    cnt = cross[0][0].astype(int) + cross[1][0] + cross[2][0]
    sel = cnt == 2
    pts = []
    for m, p in cross:
        pts.append(np.where(m[:, None], p, np.nan))
    P = np.stack(pts, 1)[sel]          # (k,3,3) with one nan row
    out = []
    for tri in P:
        q = tri[~np.isnan(tri[:, 0])]
        if len(q) == 2: out.append(q)
    return out

def chain(segs, tol=0.06):
    key = lambda p: (round(p[0]*200), round(p[1]*200), round(p[2]*200))
    adj = {}; pos = {}
    for k, (a, b) in enumerate(segs):
        ka, kb = key(a), key(b)
        if ka == kb: continue
        pos[ka] = a; pos[kb] = b
        adj.setdefault(ka, []).append(kb); adj.setdefault(kb, []).append(ka)
    used = set(); lines = []
    def walk(start):
        line = [start]; cur = start; prev = None
        while True:
            nxt = None
            for n in adj[cur]:
                e = (min(cur, n), max(cur, n))
                if e not in used: nxt = n; used.add(e); break
            if nxt is None: break
            line.append(nxt); cur = nxt
        return line
    starts = [k for k in adj if len(adj[k]) != 2] + list(adj.keys())
    for k in starts:
        while any((min(k, n), max(k, n)) not in used for n in adj[k]):
            l = walk(k)
            if len(l) > 1: lines.append(np.array([pos[x] for x in l]))
    return [dp(l, tol) for l in lines]

def dp(P, tol):
    if len(P) < 3: return P
    a, b = P[0], P[-1]; ab = b - a; L = np.linalg.norm(ab)
    if L < 1e-9: d = np.linalg.norm(P - a, axis=1)
    else: d = np.linalg.norm(np.cross(P - a, ab), axis=1) / L
    i = int(np.argmax(d))
    if d[i] > tol: return np.vstack([dp(P[:i+1], tol)[:-1], dp(P[i:], tol)])
    return np.array([a, b])

def grid(V, T):
    r = np.hypot(V[:, 0], V[:, 1]); th = np.arctan2(V[:, 1], V[:, 0])
    segs = []
    for z in np.arange(-260, 260, 7.0) + 0.37:            # stations
        segs += slice_mesh(V, T, V[:, 2] - z)
    for k in range(12):                                       # meridians (full planes)
        a = math.radians(7.5 + 15 * k)
        segs += slice_mesh(V, T, -V[:, 0]*math.sin(a) + V[:, 1]*math.cos(a))
    for R in np.arange(42, 130, 8.0) + 0.3:                   # cylinders: only cut protruding features
        segs += slice_mesh(V, T, r - R)
    return chain(segs)

SC = 50.0  # int16 units per mm
blob = bytearray(); manifest = {"scale": SC, "parts": []}
def put_pts(arr):
    global blob
    a = np.round(np.asarray(arr) * SC).astype('<i2'); off = len(blob); blob += a.tobytes(); return off
def put_u16(arr):
    global blob
    while len(blob) % 4: blob += b'\0'
    a = np.asarray(arr).astype('<u2'); off = len(blob); blob += a.tobytes(); return off
def put_polys(lines):
    pts = np.vstack(lines); lens = [len(l) for l in lines]
    po = put_pts(pts); lo = put_u16(lens); return {"p": po, "np": len(pts), "l": lo, "nl": len(lens)}

for name, s, dz in parts:
    V, T = mesh(s, dz)
    E = cad_edges(s, dz)
    G = grid(V, T)
    Vd, Td = mesh(s, dz, 0.3)   # coarser mesh for the depth (occlusion) pass
    bb = s.bounding_box(); cen = bb.center()
    entry = {"name": name, "c": [round(cen.X-CX, 2), round(cen.Y-CY, 2), round(cen.Z-Z0+dz, 2)],
             "zmin": round(bb.min.Z-Z0+dz, 2), "zmax": round(bb.max.Z-Z0+dz, 2),
             "mesh": {"v": put_pts(Vd), "nv": len(Vd), "i": put_u16(Td.ravel()), "ni": Td.size},
             "edges": put_polys(E), "grid": put_polys(G)}
    manifest["parts"].append(entry)
    print(name, "depthTris", len(Td), "edges", len(E), "gridLines", len(G), "gridPts", entry["grid"]["np"])
open("assets/drone/drone.bin", "wb").write(bytes(blob))
json.dump(manifest, open("assets/drone/drone.json", "w"), indent=1)
print("bin bytes", len(blob))
