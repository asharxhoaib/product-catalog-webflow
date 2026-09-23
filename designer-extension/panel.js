/**
 * App Panel controller for product-catalog-webflow. Talks to this app's own backend;
 * site identity comes from the ?site= query param set by the OAuth callback, or from the
 * Designer Extension runtime's webflow.getSiteInfo() when available.
 */
(function () {
  "use strict";

  var API_BASE = window.location.origin.replace(/\/designer-extension.*/, "");
  var SOURCE_FIELDS = ["", "sku", "name", "description", "price", "currency", "stockStatus", "category", "imageUrl"];
  var CMS_FIELDS = ["name", "slug", "sku", "price", "currency", "stock-status", "image", "category", "description"];
  var DEFAULT_MAP = {
    name: "name", sku: "sku", price: "price", currency: "currency",
    "stock-status": "stockStatus", image: "imageUrl", category: "category", description: "description",
  };

  var state = { siteId: null, collections: [], fieldMap: Object.assign({}, DEFAULT_MAP) };

  function api(path, options) {
    return fetch(API_BASE + "/api" + path, Object.assign({ headers: { "Content-Type": "application/json" } }, options)).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      });
    });
  }

  function resolveSiteId() {
    var q = new URL(window.location.href).searchParams.get("site");
    if (q) return Promise.resolve(q);
    if (window.webflow && window.webflow.getSiteInfo) {
      return window.webflow.getSiteInfo().then(function (i) { return i.siteId; });
    }
    return Promise.resolve(null);
  }

  function loadCollections() {
    return api("/sites/" + state.siteId + "/collections").then(function (data) {
      state.collections = data.collections || [];
      var select = document.getElementById("collection-select");
      select.innerHTML = "";
      state.collections.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.displayName;
        select.appendChild(o);
      });
    });
  }

  document.getElementById("bootstrap-collection").addEventListener("click", function () {
    api("/sites/" + state.siteId + "/collections/bootstrap", { method: "POST" }).then(loadCollections).catch(function (e) { alert(e.message); });
  });

  function renderMapping() {
    var body = document.getElementById("mapping-body");
    body.innerHTML = "";
    CMS_FIELDS.forEach(function (cmsField) {
      var tr = document.createElement("tr");
      var tdCms = document.createElement("td");
      tdCms.textContent = cmsField;
      var tdSrc = document.createElement("td");
      var select = document.createElement("select");
      SOURCE_FIELDS.forEach(function (f) {
        var o = document.createElement("option");
        o.value = f;
        o.textContent = f || "(unmapped)";
        if (state.fieldMap[cmsField] === f) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener("change", function () {
        if (select.value) state.fieldMap[cmsField] = select.value;
        else delete state.fieldMap[cmsField];
      });
      tdSrc.appendChild(select);
      tr.appendChild(tdCms);
      tr.appendChild(tdSrc);
      body.appendChild(tr);
    });
  }

  function loadMapping() {
    return api("/sites/" + state.siteId + "/mapping").then(function (data) {
      if (data.mapping) {
        state.fieldMap = JSON.parse(data.mapping.field_map_json);
        document.getElementById("dry-run").checked = !!data.mapping.dry_run;
        var select = document.getElementById("collection-select");
        select.value = data.mapping.collection_id;
      }
      renderMapping();
    });
  }

  document.getElementById("save-mapping").addEventListener("click", function () {
    api("/sites/" + state.siteId + "/mapping", {
      method: "PUT",
      body: JSON.stringify({
        collectionId: document.getElementById("collection-select").value,
        fieldMap: state.fieldMap,
        dryRun: document.getElementById("dry-run").checked,
      }),
    }).then(function () { alert("Mapping saved."); }).catch(function (e) { alert(e.message); });
  });

  document.getElementById("sync-now").addEventListener("click", function () {
    var status = document.getElementById("sync-status");
    status.textContent = "Syncing…";
    api("/sites/" + state.siteId + "/sync", {
      method: "POST",
      body: JSON.stringify({
        dryRun: document.getElementById("dry-run").checked,
        publish: document.getElementById("publish-after").checked,
      }),
    }).then(function () {
      status.textContent = "Sync finished.";
      return loadHistory();
    }).catch(function (e) { status.textContent = "Sync failed: " + e.message; });
  });

  function loadHistory() {
    return api("/sites/" + state.siteId + "/sync-runs").then(function (data) {
      var body = document.getElementById("history-body");
      body.innerHTML = "";
      (data.runs || []).forEach(function (run) {
        var errors = JSON.parse(run.error_json || "[]");
        var tr = document.createElement("tr");
        [run.started_at, run.status + (run.dry_run ? " (dry)" : ""), run.created_count, run.updated_count, run.archived_count, run.skipped_count, errors.length].forEach(function (v, i) {
          var td = document.createElement("td");
          td.textContent = v;
          if (i === 6 && errors.length) { td.className = "err"; td.title = errors.join("\n"); }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    });
  }

  resolveSiteId().then(function (siteId) {
    state.siteId = siteId;
    if (!siteId) return;
    loadCollections().then(loadMapping).then(loadHistory);
  });
})();
