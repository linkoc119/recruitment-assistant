import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command, request, allPages, ApiError, errorText } from '../dist/lib/api.js';

test('uncertain command retries reuse its key; a changed intent gets a new key', async t => {
 const calls=[];
 t.mock.method(globalThis,'fetch',async (url,options)=>{calls.push({url,...options});if(calls.length===1)throw Error('offline');return Response.json({id:'1'});});
 const send=command(), signal=new AbortController().signal;
 await assert.rejects(send('/jobs',{title:'one'},signal),e=>e.code==='network_error');
 await send('/jobs',{title:'one'},signal); await send('/jobs',{title:'two'},signal);
 assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
 assert.notEqual(calls[1].headers['Idempotency-Key'],calls[2].headers['Idempotency-Key']);
 assert.equal(calls[1].cache,'no-store');
});
test('multipart upload keeps browser boundary and stable retry identity', async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options);return Response.json({});});
 const send=command(),signal=new AbortController().signal,form=new FormData();form.append('files',new Blob(['synthetic']),'cv.pdf');
 await send('/jobs/1/resume-batches',form,signal,'POST','batch-a');await send('/jobs/1/resume-batches',form,signal,'POST','batch-a');
 assert.equal(calls[0].headers['Content-Type'],undefined);assert.equal(calls[0].body,form);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
});
test('stale responses expose safe code/request ID, not server data', async t=>{
 const requestId='12345678-1234-1234-1234-123456789012';
 t.mock.method(globalThis,'fetch',async()=>Response.json({code:'stale_result',message:'PRIVATE CV TEXT'},{status:409,headers:{'X-Request-Id':requestId}}));
 await assert.rejects(request('/result'),e=>{assert.ok(e instanceof ApiError);assert.ok(errorText(e).includes(requestId));assert.doesNotMatch(errorText(e),/PRIVATE/);return true;});
});

test('untrusted error codes and malformed request IDs are not rendered', () => {
 assert.equal(errorText(new ApiError('PRIVATE_CV', 500, 'private@example.invalid')), 'Request failed. Check your input or retry.');
});
test('collection pagination collects every page and preserves existing filters',async t=>{
 const urls=[];t.mock.method(globalThis,'fetch',async url=>{urls.push(url);return Response.json({items:urls.length===1?Array.from({length:100},(_,i)=>i):[100],page:{offset:urls.length===1?0:100,limit:100,total:101}});});
 const rows=await allPages('/jobs/1/resumes?status=parsed',new AbortController().signal);
 assert.equal(rows.length,101);assert.match(urls[1],/status=parsed&offset=100&limit=100/);
});
test('aborted reads propagate cancellation without converting to a network error',async t=>{
 const controller=new AbortController();controller.abort();const error=new DOMException('Aborted','AbortError');
 t.mock.method(globalThis,'fetch',async()=>{throw error;});await assert.rejects(request('/jobs',{signal:controller.signal}),e=>e===error);
});
