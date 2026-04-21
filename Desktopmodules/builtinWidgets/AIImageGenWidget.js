/**
 * VCPdesktop - AI 生图工作流挂件模块
 * 负责：AI 生图工作流选择器、提示词编辑、图像生成
 */

'use strict';

(function () {
  const { state, CONSTANTS, widget } = window.VCPDesktop;

  // AI 生图挂件 HTML 模板
  var AI_IMAGE_GEN_HTML = [
    '<style>',
    '.ai-container { padding: 16px; background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(192,132,252,0.1)); border-radius: 12px; color: #fff; font-family: "Segoe UI", -apple-system, sans-serif; min-width: 400px; backdrop-filter: blur(10px); }',
    '.ai-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }',
    '.ai-title { font-size: 14px; font-weight: 600; color: #c084fc; }',
    '.ai-category-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }',
    '.ai-tab { padding: 6px 12px; background: rgba(124,58,237,0.2); border: 1px solid rgba(124,58,237,0.3); border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 11px; color: #a78bfa; }',
    '.ai-tab:hover { background: rgba(124,58,237,0.3); }',
    '.ai-tab.active { background: #7c3aed; color: #fff; border-color: #7c3aed; }',
    '.ai-workflow-list { max-height: 200px; overflow-y: auto; margin-bottom: 12px; }',
    '.ai-workflow-item { padding: 10px; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.2); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }',
    '.ai-workflow-item:hover { background: rgba(124,58,237,0.2); border-color: #7c3aed; }',
    '.ai-workflow-item.selected { border-color: #c084fc; box-shadow: 0 0 10px rgba(124,58,237,0.3); }',
    '.ai-wf-id { font-size: 9px; color: #7c3aed; font-weight: 600; }',
    '.ai-wf-name { font-size: 12px; font-weight: 500; margin: 4px 0; }',
    '.ai-wf-desc { font-size: 10px; color: rgba(255,255,255,0.6); }',
    '.ai-prompt-section { margin-top: 12px; }',
    '.ai-textarea { width: 100%; min-height: 80px; background: rgba(0,0,0,0.3); border: 1px solid rgba(124,58,237,0.3); border-radius: 6px; padding: 8px; color: #fff; font-family: monospace; font-size: 10px; resize: vertical; margin-bottom: 8px; }',
    '.ai-textarea:focus { outline: none; border-color: #7c3aed; }',
    '.ai-params { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }',
    '.ai-param { background: rgba(124,58,237,0.1); padding: 6px; border-radius: 6px; text-align: center; }',
    '.ai-param-label { font-size: 9px; color: rgba(255,255,255,0.5); }',
    '.ai-param-value { font-size: 11px; font-weight: 600; color: #c084fc; }',
    '.ai-actions { display: flex; gap: 8px; }',
    '.ai-btn { flex: 1; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500; transition: all 0.2s; }',
    '.ai-btn-primary { background: #7c3aed; color: #fff; }',
    '.ai-btn-primary:hover { background: #6d28d9; }',
    '.ai-btn-secondary { background: rgba(124,58,237,0.2); color: #a78bfa; }',
    '.ai-btn-secondary:hover { background: rgba(124,58,237,0.3); }',
    '.ai-status { padding: 8px; border-radius: 6px; margin-top: 8px; font-size: 10px; text-align: center; display: none; }',
    '.ai-status.success { background: rgba(16,185,129,0.2); border: 1px solid #10b981; color: #10b981; display: block; }',
    '.ai-status.error { background: rgba(239,68,68,0.2); border: 1px solid #ef4444; color: #ef4444; display: block; }',
    '.ai-status.info { background: rgba(59,130,237,0.2); border: 1px solid #3b82f6; color: #3b82f6; display: block; }',
    '</style>',
    '<div class="ai-container">',
    '  <div class="ai-header">',
    '    <span class="ai-title">🎨 AI 生图工作流</span>',
    '  </div>',
    '  <div class="ai-category-tabs" id="ai-category-tabs">',
    '    <span class="ai-tab active" data-category="all">全部</span>',
    '    <span class="ai-tab" data-category="ecommerce">服装电商</span>',
    '    <span class="ai-tab" data-category="portrait">人像写真</span>',
    '    <span class="ai-tab" data-category="marketing">营销海报</span>',
    '    <span class="ai-tab" data-category="anime">二次元</span>',
    '  </div>',
    '  <div class="ai-workflow-list" id="ai-workflow-list"></div>',
    '  <div class="ai-prompt-section" id="ai-prompt-section" style="display:none;">',
    '    <div class="ai-params" id="ai-params"></div>',
    '    <label style="font-size:10px;color:rgba(255,255,255,0.6);">提示词</label>',
    '    <textarea class="ai-textarea" id="ai-prompt-input" placeholder="正面提示词..."></textarea>',
    '    <label style="font-size:10px;color:rgba(255,255,255,0.6);">负面提示词</label>',
    '    <textarea class="ai-textarea" id="ai-negative-input" placeholder="负面提示词..."></textarea>',
    '    <div class="ai-actions">',
    '      <button class="ai-btn ai-btn-primary" id="ai-generate-btn">🚀 生成</button>',
    '      <button class="ai-btn ai-btn-secondary" id="ai-copy-btn">📋 复制</button>',
    '    </div>',
    '    <div class="ai-status" id="ai-status"></div>',
    '  </div>',
    '</div>',
    '<script>',
    '(function() {',
    '  var workflows = [',
    '    { id: "WF-001", name: "电商模特图 - 基础", category: "ecommerce", desc: "标准电商服装展示", complexity: 1 },',
    '    { id: "WF-002", name: "电商模特图 - 场景化", category: "ecommerce", desc: "场景化穿搭展示", complexity: 2 },',
    '    { id: "WF-005", name: "清新人像", category: "portrait", desc: "清新风格人像写真", complexity: 1 },',
    '    { id: "WF-006", name: "职业形象照", category: "portrait", desc: "职业头像/工牌照", complexity: 2 },',
    '    { id: "WF-008", name: "电商促销海报", category: "marketing", desc: "电商活动促销", complexity: 1 },',
    '    { id: "WF-010", name: "二次元角色设计", category: "anime", desc: "原创角色/同人创作", complexity: 2 }',
    '  ];',
    '  ',
    '  var promptTemplates = {',
    '    "WF-001": { prompt: "professional model wearing {}, studio lighting, clean white background, full body shot, fashion photography, commercial grade, detailed fabric texture, masterpiece, best quality, 8k", negative: "(worst quality, low quality:1.7), watermark, text, signature, deformed", params: { width: 1024, height: 1536, steps: 30, cfg: 7.5 } },',
    '    "WF-005": { prompt: "beautiful asian woman, natural makeup, soft smile, daylight, portrait photography, masterpiece, best quality, 8k", negative: "(worst quality, low quality:1.4), ugly, deformed, bad anatomy", params: { width: 1024, height: 1024, steps: 30, cfg: 7 } },',
    '    "WF-008": { prompt: "promotional banner, sale event, clean layout, commercial design, high contrast, eye catching, 8k", negative: "(worst quality, low quality:1.4), blurry, text error", params: { width: 1024, height: 1024, steps: 30, cfg: 7 } },',
    '    "WF-010": { prompt: "anime style, original character, detailed eyes, cel shading, vibrant colors, character design, masterpiece, best quality, 8k", negative: "(worst quality, low quality:1.4), deformed, mutated", params: { width: 1024, height: 1024, steps: 30, cfg: 7 } }',
    '  };',
    '  ',
    '  var currentCategory = "all";',
    '  var selectedWorkflow = null;',
    '  ',
    '  function renderWorkflows() {',
    '    var list = document.getElementById("ai-workflow-list");',
    '    if (!list) return;',
    '    list.innerHTML = "";',
    '    workflows.forEach(function(wf) {',
    '      if (currentCategory !== "all" && wf.category !== currentCategory) return;',
    '      var item = document.createElement("div");',
    '      item.className = "ai-workflow-item";',
    '      item.innerHTML = \'<div class="ai-wf-id">\' + wf.id + \'</div><div class="ai-wf-name">\' + wf.name + \'</div><div class="ai-wf-desc">\' + wf.desc + \'</div>\';',
    '      item.onclick = function() { selectWorkflow(wf.id, item); };',
    '      list.appendChild(item);',
    '    });',
    '  }',
    '  ',
    '  function selectWorkflow(id, element) {',
    '    selectedWorkflow = id;',
    '    document.querySelectorAll(".ai-workflow-item").forEach(function(el) { el.classList.remove("selected"); });',
    '    if (element) element.classList.add("selected");',
    '    var template = promptTemplates[id] || {};',
    '    document.getElementById("ai-prompt-section").style.display = "block";',
    '    document.getElementById("ai-prompt-input").value = template.prompt || "";',
    '    document.getElementById("ai-negative-input").value = template.negative || "";',
    '    renderParams(template.params || {});',
    '  }',
    '  ',
    '  function renderParams(params) {',
    '    var container = document.getElementById("ai-params");',
    '    if (!container) return;',
    '    container.innerHTML = \'<div class="ai-param"><div class="ai-param-label">Width</div><div class="ai-param-value">\' + (params.width || 1024) + \'</div></div>\' +',
    '      \'<div class="ai-param"><div class="ai-param-label">Height</div><div class="ai-param-value">\' + (params.height || 1024) + \'</div></div>\' +',
    '      \'<div class="ai-param"><div class="ai-param-label">Steps</div><div class="ai-param-value">\' + (params.steps || 30) + \'</div></div>\';',
    '  }',
    '  ',
    '  document.getElementById("ai-category-tabs").addEventListener("click", function(e) {',
    '    if (e.target.classList.contains("ai-tab")) {',
    '      document.querySelectorAll(".ai-tab").forEach(function(t) { t.classList.remove("active"); });',
    '      e.target.classList.add("active");',
    '      currentCategory = e.target.dataset.category;',
    '      renderWorkflows();',
    '    }',
    '  });',
    '  ',
    '  // 调用后端 ComfyUI API 生成图像',
    '  async function generateImage() {',
    '    if (!selectedWorkflow) {',
    '      showStatus("请先选择一个工作流", "error");',
    '      return;',
    '    }',
    '    var prompt = document.getElementById("ai-prompt-input").value;',
    '    var negative = document.getElementById("ai-negative-input").value;',
    '    ',
    '    showStatus("正在调用 ComfyUI 生成图像...", "info");',
    '    ',
    '    try {',
    '      var response = await vcpAPI.fetch("/admin_api/plugins/ComfyUIGen/generate", {',
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    '        body: JSON.stringify({',
    '          workflow: selectedWorkflow,',
    '          prompt: prompt,',
    '          negative_prompt: negative',
    '        })',
    '      });',
    '      ',
    '      if (response.success || response.images) {',
    '        showStatus("✅ 生成成功！图像已保存到相册", "success");',
    '      } else {',
    '        showStatus("❌ 生成失败：" + (response.error || "未知错误"), "error");',
    '      }',
    '    } catch(e) {',
    '      showStatus("❌ 调用失败：" + e.message, "error");',
    '    }',
    '  }',
    '  ',
    '  function showStatus(message, type) {',
    '    var status = document.getElementById("ai-status");',
    '    status.textContent = message;',
    '    status.className = "ai-status " + type;',
    '    status.style.display = "block";',
    '    setTimeout(function() {',
    '      status.style.display = "none";',
    '    }, 5000);',
    '  }',
    '  ',
    '  document.getElementById("ai-generate-btn").addEventListener("click", generateImage);',
    '  ',
    '  document.getElementById("ai-copy-btn").addEventListener("click", function() {',
    '    var prompt = document.getElementById("ai-prompt-input").value;',
    '    navigator.clipboard.writeText(prompt).then(function() {',
    '      showStatus("✅ 已复制到剪贴板", "success");',
    '    });',
    '  });',
    '  ',
    '  renderWorkflows();',
    '  console.log("[AIImageGenWidget] Widget initialized.");',
    '})();',
    '<\/script>'
  ].join('\n');

  /**
   * 生成 AI 生图挂件
   */
  async function spawnAIImageGenWidget() {
    var widgetId = 'builtin-ai-image-gen';

    // 如果已存在则不重复创建
    if (state.widgets.has(widgetId)) return;

    var widgetData = widget.create(widgetId, {
      x: 40,
      y: CONSTANTS.TITLE_BAR_HEIGHT + 20,
      width: 450,
      height: 500,
    });

    widgetData.contentBuffer = AI_IMAGE_GEN_HTML;
    widgetData.contentContainer.innerHTML = AI_IMAGE_GEN_HTML;
    widget.processInlineStyles(widgetData);
    widgetData.isConstructing = false;
    widgetData.element.classList.remove('constructing');
    widget.autoResize(widgetData);

    // 延迟执行脚本
    setTimeout(function () {
      widget.processInlineScripts(widgetData);
    }, 100);

    console.log('[VCPdesktop] AI image generation widget spawned.');
  }

  // ============================================================
  // 导出
  // ============================================================
  window.VCPDesktop = window.VCPDesktop || {};
  window.VCPDesktop.builtinAIImageGen = {
    spawn: spawnAIImageGenWidget,
  };

})();
