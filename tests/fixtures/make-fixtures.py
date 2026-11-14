"""Builds the small scientific test files in this folder (run once; the files are committed).
Needs numpy, scipy, tifffile and the HDF5 C library (libhdf5_serial.so.103 on Debian/Ubuntu)."""
import ctypes as C, numpy as np, tifffile
from scipy.io import netcdf_file

H, W = 12, 24
LAT = np.linspace(-82.5, 82.5, H)            # south first (the reader puts north on top)
LON = np.linspace(7.5, 352.5, W)             # 0…360 (the reader turns it into −180…180)
LA, LO = np.meshgrid(LAT, LON, indexing='ij')
BASE = (30 * np.cos(np.radians(LA)) - 5 + 3 * np.sin(np.radians(LO))).astype('f4')

# ---- NetCDF classic (CDF-2), packed int16 with scale, offset and a fill value
f = netcdf_file('tiny.nc', 'w', version=2)
f.title = 'Bit2Beat test grid'
f.createDimension('time', None); f.createDimension('lat', H); f.createDimension('lon', W)
t = f.createVariable('time', 'f8', ('time',)); t.units = 'days since 2020-01-01'; t.calendar = 'standard'
la = f.createVariable('lat', 'f4', ('lat',)); la[:] = LAT; la.units = 'degrees_north'
lo = f.createVariable('lon', 'f4', ('lon',)); lo[:] = LON; lo.units = 'degrees_east'
v = f.createVariable('tas', 'i2', ('time', 'lat', 'lon'))
v.units = 'degC'; v.long_name = 'Air temperature'; v.scale_factor = np.float32(0.01); v.add_offset = np.float32(5.0); v._FillValue = np.int16(-32767)
for k in range(4):
    d = np.round((BASE + k - 5) / 0.01).astype('i2'); d[0, 0] = -32767; v[k] = d; t[k] = k * 31
f.close()

# ---- GeoTIFF (COG-like): float32, tiled, Deflate, an overview, GDAL no-data, EPSG:4326
img = np.roll(np.flipud(BASE), -W // 2, axis=1).astype("f4"); img[0, :3] = -9999   # north first, from 180° W; three no-data cells
geo = [(33550, 'd', 3, (15.0, 15.0, 0.0)), (33922, 'd', 6, (0, 0, 0, -180.0, 90.0, 0)),
       (34735, 'H', 16, (1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326)), (42113, 's', 0, '-9999', False)]
with tifffile.TiffWriter('tiny-cog.tif') as tw:
    tw.write(img, tile=(16, 16), compression='zlib', extratags=geo, photometric='minisblack')
    tw.write(img[::2, ::2].copy(), tile=(16, 16), compression='zlib', subfiletype=1, photometric='minisblack')

# ---- HDF5 / NetCDF-4 style (latest format: fixed-array and extensible-array chunk indexes)
L = C.CDLL('libhdf5_serial.so.103'); L.H5open(); hid = C.c_int64
for fn in ['H5Fcreate', 'H5Pcreate', 'H5Screate_simple', 'H5Screate', 'H5Dcreate2', 'H5Acreate2', 'H5Tcopy']: getattr(L, fn).restype = hid
g = lambda n: hid.in_dll(L, n).value
F4, F8, S1 = g('H5T_NATIVE_FLOAT_g'), g('H5T_NATIVE_DOUBLE_g'), g('H5T_C_S1_g')
arr = lambda xs: (C.c_uint64 * len(xs))(*xs)
fapl = L.H5Pcreate(hid(g('H5P_CLS_FILE_ACCESS_ID_g'))); L.H5Pset_libver_bounds(hid(fapl), 2, 2)
fid = L.H5Fcreate(b'tiny.h5', 2, hid(0), hid(fapl))
def dset(name, data, t, chunks=None, deflate=0, unlimited=False):
    dc = L.H5Pcreate(hid(g('H5P_CLS_DATASET_CREATE_ID_g')))
    if chunks: L.H5Pset_chunk(hid(dc), len(chunks), arr(chunks))
    if deflate: L.H5Pset_shuffle(hid(dc)); L.H5Pset_deflate(hid(dc), deflate)
    mx = [2**64 - 1] + list(data.shape[1:]) if unlimited else None
    sp = L.H5Screate_simple(data.ndim, arr(data.shape), arr(mx) if mx else None)
    d = L.H5Dcreate2(hid(fid), name, hid(t), hid(sp), hid(0), hid(dc), hid(0))
    L.H5Dwrite(hid(d), hid(t), hid(0), hid(0), hid(0), np.ascontiguousarray(data).ctypes.data_as(C.c_void_p)); return d
def attr(obj, name, val):
    if isinstance(val, str):
        t = L.H5Tcopy(hid(S1)); L.H5Tset_size(hid(t), C.c_size_t(len(val) + 1)); a = L.H5Acreate2(hid(obj), name, hid(t), hid(L.H5Screate(0)), hid(0), hid(0)); L.H5Awrite(hid(a), hid(t), C.c_char_p(val.encode()))
    else:
        v = np.atleast_1d(np.asarray(val, dtype='f4')); a = L.H5Acreate2(hid(obj), name, hid(F4), hid(L.H5Screate(0)), hid(0), hid(0)); L.H5Awrite(hid(a), hid(F4), v.ctypes.data_as(C.c_void_p))
attr(dset(b'/lat', LAT.astype('f4'), F4), b'units', 'degrees_north')
attr(dset(b'/lon', LON.astype('f4'), F4), b'units', 'degrees_east')
attr(dset(b'/time', np.arange(5, dtype='f8') * 365.25, F8), b'units', 'days since 2000-01-01')
cube = np.stack([BASE + k for k in range(5)]).astype('f4'); cube[:, 1, 1] = -999
d = dset(b'/sst', cube, F4, chunks=(1, 6, 12), deflate=4, unlimited=True)
attr(d, b'units', 'degC'); attr(d, b'long_name', 'Sea surface temperature'); attr(d, b'_FillValue', -999.0)
dset(b'/mask', (BASE > 10).astype('f4'), F4, chunks=(6, 12))
L.H5Fclose(hid(fid))
