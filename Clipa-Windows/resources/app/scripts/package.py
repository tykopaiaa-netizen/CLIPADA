import pathlib,zipfile,shutil,hashlib
root=pathlib.Path(__file__).resolve().parents[1];workspace=root.parent
runtime=workspace/'desktop-electron-cache/electron-v44.7.0-win32-x64.zip'
sums=(workspace/'desktop-electron-cache/SHASUMS256.txt').read_text()
expected=next(x.split()[0] for x in sums.splitlines() if x.split()[-1].lstrip('*')==runtime.name)
assert hashlib.file_digest(runtime.open('rb'),'sha256').hexdigest()==expected
out=workspace/'Clipa-Windows';out.mkdir(exist_ok=True)
with zipfile.ZipFile(runtime) as z:z.extractall(out)
(out/'electron.exe').replace(out/'Clipa.exe')
(out/'resources/default_app.asar').unlink(missing_ok=True)
app=out/'resources/app';shutil.copytree(root,app,dirs_exist_ok=True)
for name in ['COMO-ABRIR.txt','VALIDACAO-DESKTOP.txt']:shutil.copy2(root/name,out/name)
archive=workspace/'Clipa-Desktop-3.0-Windows.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for file in sorted(out.rglob('*')):
  if file.is_file() and file.relative_to(out).as_posix() not in {'electron.exe','resources/default_app.asar'}:z.write(file,file.relative_to(workspace))
print(archive,archive.stat().st_size)
