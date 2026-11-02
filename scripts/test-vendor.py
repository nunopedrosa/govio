"""Pinned media assets and real deploy profile; local temporary repositories only."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,shutil,os
ROOT=Path(__file__).resolve().parents[1]
lock=json.loads((ROOT/'tools/mediabunny-lock.json').read_text())
for name,meta in lock['files'].items():
 p=ROOT/'vendor/mediabunny'/name
 assert p.is_file() and p.stat().st_size==meta['size']
 assert hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256']
def run(*args,cwd=None,ok=True):
 p=subprocess.run(args,cwd=cwd,capture_output=True,text=True)
 assert (p.returncode==0)==ok,(args,p.stdout,p.stderr)
 return p
run('php','tools/fetch_mediabunny.php','--check',cwd=ROOT)
with tempfile.TemporaryDirectory(prefix='govio-deploy-') as temp:
 base=Path(temp);origin=base/'origin';repo=base/'repo';site=base/'site';site.mkdir();origin.mkdir()
 for entry in ROOT.iterdir():
  if entry.name=='.git':continue
  if entry.is_dir():shutil.copytree(entry,origin/entry.name)
  else:shutil.copyfile(entry,origin/entry.name)
 run('git','init','-b','main',str(origin));run('git','config','user.name','Test',cwd=origin);run('git','config','user.email','test@example.invalid',cwd=origin);run('git','add','-A',cwd=origin);run('git','commit','-m','fixture',cwd=origin);run('git','clone',str(origin),str(repo))
 (site/'keep.txt').write_text('host file')
 run('bash','scripts/deploy.sh','--dry-run',str(site),cwd=repo);assert sorted(p.name for p in site.iterdir())==['keep.txt']
 run('bash','scripts/deploy.sh','--no-pull',str(site),cwd=repo)
 for name in lock['files']:
  assert (site/'vendor/mediabunny'/name).read_bytes()==(ROOT/'vendor/mediabunny'/name).read_bytes()
 assert 'application/javascript .cjs' in (site/'.htaccess').read_text()
 assert (site/'keep.txt').read_text()=='host file';assert not (site/'tools').exists()
 (site/'.htaccess').write_text('custom host headers');run('bash','scripts/deploy.sh','--no-pull',str(site),cwd=repo);assert (site/'.htaccess').read_text()=='custom host headers'
 damaged=repo/'vendor/mediabunny/mediabunny-aac-encoder.min.js';damaged.write_text('damaged');run('php','tools/fetch_mediabunny.php','--check',cwd=repo,ok=False)
 run('git','restore','--','vendor/mediabunny/mediabunny-aac-encoder.min.js',cwd=repo)
 damaged.unlink();run('php','tools/fetch_mediabunny.php','--check',cwd=repo,ok=False)
 # Mock HTTPS at PHP stream level: deterministic fixtures, no external requests.
 mock=base/'mock-download.php';mock.write_text("""<?php
 class VendorFixture {public $context;private string $data='';private int $pos=0;
 function stream_open($url,$mode,$options,&$opened){$file=basename($url);$this->data=file_get_contents(getenv('VENDOR_FIXTURE').'/'.$file);if(getenv('BROKEN_AAC')&&str_contains($file,'aac-encoder'))$this->data.='broken';return true;}
 function stream_read($n){$chunk=substr($this->data,$this->pos,$n);$this->pos+=strlen($chunk);return $chunk;}
 function stream_eof(){return $this->pos>=strlen($this->data);}
 function stream_stat(){return ['size'=>strlen($this->data)];}}
 stream_wrapper_unregister('https');stream_wrapper_register('https',VendorFixture::class);
 """)
 for name in lock['files']:(repo/'vendor/mediabunny'/name).write_text('old bytes')
 env=dict(os.environ,VENDOR_FIXTURE=str(ROOT/'vendor/mediabunny'),BROKEN_AAC='1')
 result=subprocess.run(['php','-d','auto_prepend_file='+str(mock),'tools/fetch_mediabunny.php'],cwd=repo,env=env,capture_output=True,text=True);assert result.returncode!=0,result.stdout
 assert all((repo/'vendor/mediabunny'/name).read_text()=='old bytes' for name in lock['files']);assert not list((repo/'vendor/mediabunny').glob('.vendor-*'))
 env.pop('BROKEN_AAC');result=subprocess.run(['php','-d','auto_prepend_file='+str(mock),'tools/fetch_mediabunny.php'],cwd=repo,env=env,capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
 run('php','tools/fetch_mediabunny.php','--check',cwd=repo)
print('PASS pinned hashes, readonly checks/dry-run, clean-checkout deployment, vendor/public headers, preserved host files and corrupt/missing detection')
