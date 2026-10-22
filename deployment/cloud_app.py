"""Select one isolated web backend. Native desktop integrations stay local."""
import os
import sys
from pathlib import Path

from .cloud_sessions import CloudSessions, SessionMapping, SessionObject
from .tool_access import ToolAccess

SERVICE = os.environ.get('SPANVISION_SERVICE', 'bim')
ROOT = Path(__file__).resolve().parent.parent
os.environ['SPANVISION_CLOUD'] = '1'
if SERVICE == 'bim':
    tool = ROOT / 'vision-bim-validator'
    sys.path.insert(0, str(tool))
    sys.path.insert(0, str(tool / 'src'))
    from server import main
    main.uploaded_files = SessionMapping('bim_uploads', dict)
    main.project_manager = SessionObject('bim_models', main.ProjectManager)
    main.job_manager = SessionObject('bim_jobs', main.JobManager)
    main.MAX_FILE_SIZE = 50 * 1024 * 1024
    # File/project routes already enforce the trusted tenant supplied above.
    from server.routers import projects
    projects.MAX_IFC_SIZE = 50 * 1024 * 1024
    projects.TYPE_SIZE_LIMITS['ifc'] = projects.MAX_IFC_SIZE
    api = main.app
elif SERVICE == 'stl':
    sys.path.insert(0, str(ROOT / 'spanvision-stl-3d-map-workspace'))
    from app import main
    main._design_cache = SessionMapping('stl_designs', dict)
    api = main.app
else:
    raise RuntimeError('SPANVISION_SERVICE must be bim or stl')

app = ToolAccess(CloudSessions(api, secure=os.environ.get('SPANVISION_CLOUD_INSECURE_TEST') != '1'), SERVICE)
