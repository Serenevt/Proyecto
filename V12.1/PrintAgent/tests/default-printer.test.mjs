import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('restores only the automatically selected target, using mocked settings and no printing',{skip:process.platform!=='win32'&&'requires Windows PowerShell'},()=>{
 const module=fileURLToPath(new URL('../print-state.psm1',import.meta.url)).replaceAll("'","''");
 const command=`$ErrorActionPreference='Stop'; Import-Module '${module}' -Force; $results=@(); foreach($initial in @('Target','Original','Other')){ $state=[pscustomobject]@{Current=$initial;Calls=0}; $read={ $state.Current }.GetNewClosure(); $set={param($name) $state.Current=$name; $state.Calls++}.GetNewClosure(); $result=Restore-FuelFlowDefaultPrinter -OriginalName 'Original' -TargetName 'Target' -ReadDefault $read -SetDefault $set; $results+=@{initial=$initial;after=$state.Current;calls=$state.Calls;restored=$result.restored;preserved=$result.preserved} }; ConvertTo-Json -InputObject $results -Compress`;
 const results=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000}).replace(/^\uFEFF/,''));
 assert.deepEqual(results.map(r=>[r.initial,r.after,r.calls,r.restored,r.preserved]),[['Target','Original',1,true,true],['Original','Original',0,false,true],['Other','Other',0,false,false]]);
});
