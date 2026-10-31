#!/usr/bin/env python3
"""Generate the two unpacked browser distributions from the built source."""
import json,shutil,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
out=root.parent/'Clipa-2.3-Multinavegador'
out.mkdir(exist_ok=True)
for target in ('chromium','firefox'):
 dest=out/('clipa-'+target)
 shutil.copytree(root,dest,dirs_exist_ok=True)
 manifest=json.loads((dest/'manifest.json').read_text())
 if target=='firefox':
  manifest['background']={'scripts':['background.js']}
  manifest['permissions'].remove('desktopCapture')
  manifest['commands']['toggle-recording'].pop('global',None)
  manifest['browser_specific_settings']={'gecko':{'id':'clipa-local@clipa.extension','strict_min_version':'140.0','data_collection_permissions':{'required':['none']}}}
 (dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copy2(root/'LEIA-ME.txt',out/'COMECE-AQUI.txt')
archive=root.parent/(out.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(out.rglob('*')):
  if f.is_file():z.write(f,f.relative_to(root.parent))
print(archive,archive.stat().st_size)
