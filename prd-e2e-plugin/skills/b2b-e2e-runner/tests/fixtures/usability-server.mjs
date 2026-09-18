// Local browser-verification fixture. No accounts, external network or real data.
import http from "node:http";
import crypto from "node:crypto";

const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Runner 本地上传与数据探索夹具</title>
<style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px;color:#20304a;background:#f5f7fa}section{padding:24px;border:1px solid #dce2eb;border-radius:16px;background:white;margin:20px 0}button,input{font:inherit;margin:8px;padding:10px}img{max-width:320px}li{padding:10px}output{display:block;padding:10px}</style>
<h1>Runner 本地验证 · 无真实业务数据</h1><p>公开隔离夹具，无账号与密码。本页面仅用于上传、合法数据探索、截图和代理回归。</p>
<section><h2>优惠券列表</h2><ul>
<li>草稿活动 · 草稿 <button data-record="draft">查看草稿详情</button></li>
<li>春季活动 · 已发布 <button data-record="expired">查看春季活动详情</button></li>
<li>秋季活动 · 已发布 <button data-record="active">查看秋季活动详情</button></li></ul><output id="detail">请选择详情，核实可用条件。</output></section>
<section><h2>横幅上传</h2><label>选择 PNG 测试横幅 <input id="file" type="file" accept="image/png"></label><output id="selection">尚未选择文件</output><img id="preview" alt="已选择的横幅预览" hidden><br><button id="upload">上传图片</button><output id="uploaded">尚未上传</output><button id="save">保存横幅</button><output id="saved">尚未保存</output></section>
<section><h2>代理验证</h2><button id="probe">读取代理测试响应</button><output id="probe-result">尚未读取</output></section>
<script>
let file, uploadedId;
document.querySelectorAll('[data-record]').forEach(button=>button.onclick=async()=>{const value=await (await fetch('/record/'+button.dataset.record)).json();document.getElementById('detail').textContent=value.description;});
document.getElementById('file').onchange=event=>{file=event.target.files[0];uploadedId=undefined;document.getElementById('selection').textContent=file?'已选择文件：'+file.name:'尚未选择文件';if(file){const img=document.getElementById('preview');img.src=URL.createObjectURL(file);img.hidden=false;}};
document.getElementById('upload').onclick=async()=>{if(!file)return;const response=await fetch('/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});const result=await response.json();if(response.ok){uploadedId=result.id;document.getElementById('uploaded').textContent='上传成功，字节数 '+result.bytes+'，图片ID '+result.id;}else document.getElementById('uploaded').textContent='上传未成功';};
document.getElementById('save').onclick=async()=>{if(!uploadedId)return;const result=await (await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:uploadedId})})).json();document.getElementById('saved').textContent='业务保存成功：'+result.image;};
document.getElementById('probe').onclick=async()=>{const response=await fetch('/probe');const body=await response.text();document.getElementById('probe-result').textContent='状态 '+response.status+'；响应 '+body+'；标记 '+response.headers.get('x-fixture');};
</script></html>`;

export function createUsabilityServer() {
  const images = new Set();
  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const json = (status, value) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(value)); };
    if (request.method === "GET" && pathname === "/") { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return response.end(page); }
    if (request.method === "GET" && request.url?.startsWith("/record/")) {
      const descriptions = { draft: "草稿，没有可使用的券 ID", expired: "已发布，但有效期已结束；券 ID coupon-expired-101，不可用于当前用例", active: "已发布且当前有效；适用范围：测试商城；可用券 ID：coupon-active-731" };
      return json(200, { description: descriptions[request.url.split("/").at(-1)] ?? "不存在" });
    }
    if (request.method === "GET" && request.url === "/probe") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-fixture": "origin" });
      return response.end(JSON.stringify({ value: "origin", requestMarker: request.headers["x-fixture-request"] ?? "none" }));
    }
    if (request.method === "POST") {
      const parts = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) return json(413, { error: "too large" }); parts.push(chunk); }
      const body = Buffer.concat(parts);
      if (request.url === "/upload") {
        if (request.headers["content-type"] !== "image/png" || body.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return json(400, { error: "PNG required" });
        const id = crypto.createHash("sha256").update(body).digest("hex").slice(0, 12); images.add(id);
        return json(200, { id, bytes: body.length });
      }
      if (request.url === "/save") {
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: "invalid" }); }
        if (!images.has(input.image)) return json(400, { error: "upload first" });
        return json(200, { image: input.image });
      }
    }
    json(404, { error: "not found" });
  });
}

if (process.argv[1]?.endsWith("usability-server.mjs")) {
  const server = createUsabilityServer();
  server.listen(0, "127.0.0.1", () => process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, pid: process.pid }) + "\n"));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close());
}
