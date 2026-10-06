import builtins
import json
import socket
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
import pytest
import trimesh
from fastapi.testclient import TestClient
from shapely.geometry import box, LineString, MultiPolygon
from app import main, updater, paths, pipeline, status
from app.appinfo import APP_NAME, INSTANCE_MARKER
from app.config import Project, DEFAULT_BANDS
from app.geo import bbox_wgs84_to_rd
from app.ifc_import import load_design
from app.pipeline import AreaData, build_model, export_model
from app.sources import Building, SurfaceData, OverpassUnavailable

@pytest.fixture
def area():
    bounds=bbox_wgs84_to_rd((5.1155,52.0875,5.1185,52.0895));x,y,xx,yy=bounds
    return AreaData(bounds,[Building('one',box(x+20,y+20,x+50,y+50),12,0),Building('two',box(x+65,y+60,x+90,y+85),18,0)],SurfaceData(water=MultiPolygon([box(x+5,y+5,x+12,yy-5)]),road_lines=[(LineString([(x+100,y),(x+100,yy)]),6)],tree_points=[(x+120,y+120)]))

@pytest.fixture
def project():
    return Project.from_dict({'id':'fixture','name':'Fixture','bbox_wgs84':[5.1155,52.0875,5.1185,52.0895],'settings':{'max_size_mm':180,'include_trees':True}})

def test_identity_and_no_upstream_update():
    with TestClient(main.app) as client, patch('requests.get',side_effect=AssertionError('Unexpected network request')):
        assert client.get('/api/ping').json()['app']==INSTANCE_MARKER
        info=client.get('/api/appinfo').json()
        assert info['name']==APP_NAME and info['organization']=='Spanvision Infra' and info['mark']=='STL'
        assert info['feedback_url'] is None
        assert client.get('/api/update-check').json()['enabled'] is False
        assert 'MIT License' in client.get('/api/notices').text

def test_migration_retains_original_and_newer(tmp_path):
    old=tmp_path/'old';new=tmp_path/'new';old.mkdir();new.mkdir()
    (old/'settings.json').write_text(json.dumps({'export_dir':'D:/my-exports'}))
    (old/'projects').mkdir();(new/'projects').mkdir()
    (old/'projects'/'existing.json').write_text('old');(new/'projects'/'existing.json').write_text('new')
    (old/'projects'/'missing.json').write_text('missing')
    (old/'uploads').mkdir();(old/'uploads'/'design.stl').write_bytes(b'design')
    paths.migrate_profile(new,old);paths.migrate_profile(new,old)
    assert (new/'projects'/'existing.json').read_text()=='new'
    assert (new/'projects'/'missing.json').read_text()=='missing'
    assert (old/'projects'/'existing.json').read_text()=='old'
    assert json.loads((new/'settings.json').read_text())['export_dir']=='D:/my-exports'
    assert (new/'uploads'/'design.stl').read_bytes()==b'design'

def test_geometry_colors_slots_and_support(area,project,tmp_path):
    project.hidden_building_ids=['two'];model=build_model(area,project)
    assert max(model.stats['plate_mm'])<=180.01
    assert model.layers['buildings'].difference(model.layers['land'].buffer(.01)).area<.01
    assert model.layers['land'].intersection(model.layers['water']).area<.01
    assert model.layers['roads'].difference(model.layers['plate']).area<.01
    expected={band.key:(band.color,project.settings.slot_for(band.key)) for band in DEFAULT_BANDS}
    assert all((body.color,body.slot)==expected[body.key] for body in model.bodies)
    files=export_model(model,tmp_path,'fixture')
    assert any(f['name']=='fixture_README.txt' for f in files)
    with zipfile.ZipFile(tmp_path/'fixture.3mf') as archive:
        root=ET.fromstring(archive.read('3D/3dmodel.model'))
        application=root.find("{*}metadata[@name='Application']").text
        assert application=='STL-3D map workspace — Spanvision Infra'
        assert 'Metadata/model_settings.config' in archive.namelist()
        for name in archive.namelist():
            if name.endswith('.model'):ET.fromstring(archive.read(name))
    for item in tmp_path.glob('*.stl'):
        mesh=trimesh.load(item);assert len(mesh.faces)>0 and mesh.is_watertight

def test_design_import_placement_and_optional_ifc(area,project,tmp_path):
    source=tmp_path/'model.stl';trimesh.creation.box(extents=(20,30,50)).export(source)
    design=load_design(source);assert design.size_m==pytest.approx((.02,.03,.05))
    project.design.filename='model.stl'
    model=build_model(area,project,design);body=next(b for b in model.bodies if b.key=='design')
    assert body.mesh.bounds[0][2]==pytest.approx(project.settings.snapped().land_top)
    with pytest.raises(ValueError,match='not supported'):load_design(tmp_path/'model.xyz')
    original=builtins.__import__
    def without_ifc(name,*args,**kwargs):
        if name.startswith('ifcopenshell'):raise ImportError('optional dependency absent')
        return original(name,*args,**kwargs)
    with patch('builtins.__import__',side_effect=without_ifc), pytest.raises(RuntimeError,match='IFC support is unavailable'):
        load_design(tmp_path/'model.ifc')

def test_api_area_build_download_projects_and_folder_cancel(area,project,tmp_path,monkeypatch):
    monkeypatch.setattr(main,'load_area',lambda *a,**k:area)
    monkeypatch.setattr(main,'export_dir',lambda:tmp_path)
    monkeypatch.setattr(main,'PROJECT_DIR',tmp_path/'projects');main.PROJECT_DIR.mkdir()
    monkeypatch.setattr(main,'pick_folder',lambda *a:None)
    with TestClient(main.app) as client:
        assert client.post('/api/area',json={'project':project.to_dict()}).json()['geojson']['features']
        saved=client.post('/api/projects/save',json={'project':project.to_dict()});assert saved.status_code==200
        assert client.get('/api/projects/fixture').json()['bbox_wgs84']==list(project.bbox_wgs84)
        assert client.post('/api/build',json={'project':project.to_dict(),'choose_dir':True}).status_code==409
        built=client.post('/api/build',json={'project':project.to_dict()});assert built.status_code==200
        assert client.get('/api/download/fixture/fixture.3mf').content.startswith(b'PK')
        assert client.get('/api/download/fixture/missing.stl').status_code==404
        assert client.post('/api/export-dir/pick').json()['changed'] is False

def test_unavailable_provider_retains_buildings(project,area,monkeypatch):
    monkeypatch.setattr(pipeline,'fetch_buildings',lambda *a,**k:area.buildings)
    monkeypatch.setattr(pipeline,'fetch_surfaces',lambda *a,**k:(_ for _ in ()).throw(OverpassUnavailable('Provider unavailable')))
    result=pipeline.load_area(project,refresh=True)
    assert result.buildings and result.surfaces_error=='Provider unavailable'

def test_preview_status_rejects_changed_inputs(tmp_path,monkeypatch):
    (tmp_path/'source.py').write_text('before');stamp={'brandDigest':status.BRAND['brandDigest'],'inputs':['source.py']}
    monkeypatch.setattr(status,'ROOT',tmp_path)
    initial=status.current_fingerprint(stamp);stamp['sourceFingerprint']=initial
    stamp_path=tmp_path/'suite-build.json';stamp_path.write_text(json.dumps(stamp))
    monkeypatch.setattr(status,'STAMP_PATH',stamp_path);monkeypatch.setattr(status,'START_FINGERPRINT',initial)
    assert status.preview_status()['available']
    (tmp_path/'source.py').write_text('after');assert not status.preview_status()['available']

def test_launcher_marker_and_conflict(monkeypatch):
    import run_app
    response=type('Response',(),{'__enter__':lambda self:self,'__exit__':lambda *a:None,'read':lambda self:json.dumps({'app':INSTANCE_MARKER}).encode()})()
    with patch('urllib.request.urlopen',return_value=response):assert run_app._already_running()
    monkeypatch.setattr(run_app,'_already_running',lambda *a:False)
    monkeypatch.setattr(run_app.sys,'platform','linux')
    with socket.socket() as server:
        server.bind(('127.0.0.1',0));server.listen();monkeypatch.setattr(run_app,'PREFERRED_PORT',server.getsockname()[1])
        assert run_app.main()==1
