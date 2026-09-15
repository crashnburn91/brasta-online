import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('app/api/player-avatar/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(avatar='https://example.test/donny.jpg') {
  const exports={},calls=[];
  runInNewContext(source,{exports,URL,process:{env:{}},console:{error(){}},require:()=>({NextResponse:{json:(body,options)=>Response.json(body,options)}}),fetch:async(url,options)=>{
    calls.push({url,options});return Response.json([{avatar_url:avatar}]);
  }});
  return {calls,post:username=>exports.POST(new Request('https://example.test/api/player-avatar',{method:'POST',body:JSON.stringify({username})}))};
}
test('guest lookup returns public avatar without user credentials or server secret',async()=>{
  const f=fixture();const response=await f.post('Donny');
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{avatarUrl:'https://example.test/donny.jpg'});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(f.calls[0].options.headers.Authorization,undefined);
  assert.match(f.calls[0].url,/username=eq.Donny&select=avatar_url&limit=1$/);
});
test('underscores are exact username characters and wildcards are rejected',async()=>{
  const f=fixture();await f.post('a_b');assert.match(f.calls[0].url,/username=eq.a_b&/);
  await f.post('a%b');assert.equal(f.calls.length,1);
});
test('unsafe avatar URLs are not returned',async()=>{
  for(const url of ['javascript:alert(1)','http://example.test/photo.jpg',null]){
    assert.deepEqual(await (await fixture(url).post('Donny')).json(),{avatarUrl:null});
  }
});
