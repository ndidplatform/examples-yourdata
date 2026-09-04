/**
 * Mock NDID API server
 *
 * Supports two AS nodes:
 *   as1 — deposit data provider  (API :8300, callbacks :6002)
 *   as2 — credit card provider   (API :8400, callbacks :6003)
 *
 * Service routing (when as_id_list is empty):
 *   900.pre_consent_deposit_001       → as1
 *   900.pre_consent_cardpayment_001   → as2
 *   900.revoke_consent_001            → all registered AS nodes
 *
 * Your Data flows use the as_node_id field in the request to route callbacks.
 */

const http = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORTS = { idp: 8100, rp: 8200 };

// AS node definitions: apiPort = port this mock listens on for that AS's NDID API calls
//                      callbackPort = port the AS service listens on for callbacks
// Hosts can be overridden via env vars for Docker (default: localhost for local dev).
const AS_NODES = {
  as1: {
    callbackHost: process.env.AS1_CALLBACK_HOST || 'localhost',
    callbackPort: parseInt(process.env.AS1_CALLBACK_PORT || '6002'),
    apiPort:      parseInt(process.env.AS1_API_PORT      || '8300'),
  },
  as2: {
    callbackHost: process.env.AS2_CALLBACK_HOST || 'localhost',
    callbackPort: parseInt(process.env.AS2_CALLBACK_PORT || '6003'),
    apiPort:      parseInt(process.env.AS2_API_PORT      || '8400'),
  },
};

const CALLBACKS = {
  idp: { host: process.env.IDP_CALLBACK_HOST || 'localhost', port: parseInt(process.env.IDP_CALLBACK_PORT || '6000') },
  rp:  { host: process.env.RP_CALLBACK_HOST  || 'localhost', port: parseInt(process.env.RP_CALLBACK_PORT  || '6001') },
};

// Which AS node(s) handle each NDID service when as_id_list is empty.
// null  = send to all registered AS nodes.
// array = specific nodes.
const SERVICE_DEFAULT_AS = {
  '900.pre_consent_deposit_001':      'as1',        // default to AS1; multi-AS via as_id_list
  '900.pre_consent_cardpayment_001':  'as1',        // AS1 (Alpha Bank) handles credit card
  '900.revoke_consent_001':           null,         // all registered AS nodes handle revoke
};

// ─── In-memory stores ─────────────────────────────────────────────────────────

const yourDataRequests    = new Map(); // request_id → request info
const yourDataRequestData = new Map(); // request_id → data sent by AS
const ndidRequests        = new Map(); // request_id → request info + ndidData
// #11: auto_error_responses config per AS node
const autoErrorResponses  = new Map(); // asNodeId → config object
const serviceRegistrations = new Map(); // service_id → Set<asNodeId>, populated by POST /v7/as/service/{service_id}
let tokenCounter = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function post(host, port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host, port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callbackRP(path, body) {
  try {
    const r = await post(CALLBACKS.rp.host, CALLBACKS.rp.port, path, body);
    console.log(`  → RP ${path}: ${r.status}`);
  } catch (e) { console.error(`  ✗ RP ${path}:`, e.message); }
}

async function callbackIDP(path, body) {
  try {
    const r = await post(CALLBACKS.idp.host, CALLBACKS.idp.port, path, body);
    console.log(`  → IDP ${path}: ${r.status}`);
  } catch (e) { console.error(`  ✗ IDP ${path}:`, e.message); }
}

/** Send a callback to a specific AS node. */
async function callbackToAS(asNodeId, path, body) {
  const cb = AS_NODES[asNodeId] || AS_NODES.as1;
  try {
    const r = await post(cb.callbackHost, cb.callbackPort, path, body);
    console.log(`  → ${asNodeId} ${path}: ${r.status}`);
  } catch (e) { console.error(`  ✗ ${asNodeId} ${path}:`, e.message); }
}

/** Send a callback to all registered AS nodes. */
async function callbackAllAS(path, bodyFn) {
  for (const [nodeId] of Object.entries(AS_NODES)) {
    await callbackToAS(nodeId, path, bodyFn(nodeId));
  }
}

// ─── Flow orchestrators ───────────────────────────────────────────────────────

/**
 * Simulates the Your Data platform flow (complete-consent + data-request).
 * Routes AS callbacks to the correct node based on info.as_node_id.
 */
async function orchestrateYourDataFlow(requestId, info) {
  const asNodeId = info.as_node_id || 'as1';
  console.log(`\n[YourData] ${requestId} service=${info.service_id} as=${asNodeId}`);
  const cbPath = new URL(info.callback_url).pathname;
  const base = {
    type: 'yourdata.request_status', node_id: 'rp1',
    requester_node_id: 'rp1', as_node_id: asNodeId,
    request_id: requestId, request_timeout: info.request_timeout, timed_out: false,
  };

  // 1. pending
  await delay(300);
  await callbackRP(cbPath, { ...base, status: 'pending' });

  // #11: Check auto_error_responses config for this AS node.
  // If the AS registered an auto-error for unsupported_service or unsupported_authorization,
  // the NDID platform auto-responds without calling the AS at all.
  const asAutoErrors = autoErrorResponses.get(asNodeId) || {};
  const autoError =
    asAutoErrors.unsupported_service && info.service_id === '__unsupported__'
      ? asAutoErrors.unsupported_service
      : asAutoErrors.unsupported_authorization && info.authorization === '__unsupported__'
      ? asAutoErrors.unsupported_authorization
      : null;
  if (autoError) {
    console.log(`  [auto_error] ${asNodeId} service=${info.service_id} code=${autoError.error_code}`);
    await delay(300);
    await callbackRP(cbPath, {
      ...base, status: 'errored',
      error_code: autoError.error_code, error_message: autoError.error_message,
    });
    console.log(`[YourData] ${requestId} auto-errored\n`);
    return;
  }

  // 2. Send request to correct AS — include service_extension if RP specified it.
  // RP sends service_extension as string[]; NDID platform forwards only the first
  // value as a plain string in the AS callback body (#18).
  await delay(300);
  const dataRequestBody = {
    node_id: asNodeId, type: 'yourdata.data_request',
    request_id: requestId, service_id: info.service_id,
    requester_node_id: 'rp1', namespace: info.namespace,
    identifier: info.identifier, request_params: info.request_params,
    authorization: info.authorization,
    request_time: Date.now(), request_timeout: info.request_timeout,
  };
  // service_extension: RP sends string[], NDID forwards the full array to AS
  if (info.service_extension && info.service_extension.length > 0) {
    dataRequestBody.service_extension = info.service_extension;
  }
  await callbackToAS(asNodeId, `/yourdata/as/request/${info.service_id}`, dataRequestBody);

  // 3. Wait for AS to call POST /yourdata/as/data
  console.log(`  waiting for ${asNodeId} data on ${requestId}...`);
  for (let i = 0; i < 30; i++) {
    await delay(500);
    if (yourDataRequestData.has(requestId)) break;
  }
  if (!yourDataRequestData.has(requestId)) {
    console.error(`  ✗ ${asNodeId} never sent data for ${requestId}`);
    return;
  }

  // Check for AS error marker (set when AS calls POST /yourdata/as/error)
  const rawData = yourDataRequestData.get(requestId);
  let asErrorInfo = null;
  try {
    const parsed = JSON.parse(rawData);
    if (parsed.__error__) asErrorInfo = parsed;
  } catch {}

  if (asErrorInfo) {
    await callbackRP(cbPath, {
      ...base, status: 'errored',
      error_code: asErrorInfo.error_code,
      error_message: asErrorInfo.error_message,
    });
    console.log(`[YourData] ${requestId} ERRORED (${asErrorInfo.error_code})\n`);
    return;
  }

  // 4. Status transitions
  const asBase = {
    type: 'yourdata.request_status', node_id: asNodeId,
    requester_node_id: 'rp1', as_node_id: asNodeId,
    request_id: requestId, request_timeout: info.request_timeout, timed_out: false,
  };

  for (const status of ['data_decryption_pending', 'data_decryption_key_requested',
                        'data_decryption_key_available', 'completed']) {
    await delay(300);
    await callbackRP(cbPath, { ...base, status });
    await callbackToAS(asNodeId, '/yourdata/as/request_status_update', { ...asBase, status });
  }

  console.log(`[YourData] ${requestId} DONE\n`);
}

/**
 * Simulates the NDID on-chain flow (pre-consent + revoke, with IDP).
 * Routes AS callbacks per service using as_id_list or SERVICE_DEFAULT_AS.
 */
async function orchestrateNdidFlow(requestId, info) {
  const serviceList = info.data_request_list_full || [];
  const serviceIds  = serviceList.map(s => s.service_id);
  console.log(`\n[NDID] ${requestId} services=${serviceIds}`);
  const cbPath = new URL(info.callback_url).pathname;

  // Resolve which AS nodes handle each service.
  // When as_id_list is provided, ALL listed nodes are called (supports min_as > 1).
  // When empty, fall back to SERVICE_DEFAULT_AS.
  function resolveAs(svc) {
    if (svc.as_id_list && svc.as_id_list.length > 0) return svc.as_id_list;
    const def = SERVICE_DEFAULT_AS[svc.service_id];
    if (def === null) return Object.keys(AS_NODES);    // all nodes
    return [def || 'as1'];
  }

  const makeDataReqList = (signed, received) =>
    serviceList.map(s => ({
      service_id: s.service_id,
      as_id_list: resolveAs(s),
      min_as: 1,
      request_params_hash: uid(),
      response_list: signed ? resolveAs(s).map(id => ({
        as_id: id, signed: true, received_data: received,
      })) : [],
    }));

  // 1. create_request_result
  await delay(200);
  await callbackRP(cbPath, {
    node_id: 'rp1', type: 'create_request_result',
    reference_id: info.reference_id, request_id: requestId, success: true,
    creation_block_height: '1:100',
  });

  // 2. pending
  await delay(200);
  await callbackRP(cbPath, {
    node_id: 'rp1', type: 'request_status', request_id: requestId,
    requester_node_id: 'rp1', mode: info.mode ?? 2, request_message_hash: uid(),
    min_ial: 2.3, min_aal: 2.1, min_idp: 1,
    ...(info.request_type ? { request_type: info.request_type } : {}),
    idp_id_list: ['idp1'],
    response_list: [], data_request_list: makeDataReqList(false, false),
    request_timeout: info.request_timeout, closed: false, timed_out: false,
    status: 'pending', block_height: '1:101',
  });

  // 3. IDP incoming request → IDP auto-accepts
  await delay(300);
  await callbackIDP('/idp/request', {
    node_id: 'idp1', type: 'incoming_request', mode: info.mode ?? 2,
    request_id: requestId, request_message: info.request_message,
    request_message_hash: uid(), request_message_salt: uid(),
    requester_node_id: 'rp1', min_ial: 2.3, min_aal: 2.1,
    ...(info.request_type ? { request_type: info.request_type } : {}),
    initial_salt: uid(), creation_time: Date.now(),
    creation_block_height: '1:100', request_timeout: info.request_timeout,
    namespace: info.namespace, identifier: info.identifier,
    data_request_list: serviceList.map(s => ({ service_id: s.service_id, as_id_list: resolveAs(s), min_as: 1 })),
  });

  await delay(1500);

  // 4. confirmed (IDP responded)
  await callbackRP(cbPath, {
    node_id: 'rp1', type: 'request_status', request_id: requestId,
    requester_node_id: 'rp1', mode: info.mode ?? 2, request_message_hash: uid(),
    min_ial: 2.3, min_aal: 2.1, min_idp: 1,
    ...(info.request_type ? { request_type: info.request_type } : {}),
    idp_id_list: ['idp1'],
    response_list: [{ idp_id: 'idp1', ial: 2.3, aal: 2.1, status: 'accept',
      valid_signature: true, valid_ial: true }],
    data_request_list: makeDataReqList(false, false),
    request_timeout: info.request_timeout, closed: false, timed_out: false,
    status: 'confirmed', block_height: '1:105',
  });

  // 5. AS callbacks — one per (service, AS node)
  for (const svc of serviceList) {
    const asNodes = resolveAs(svc);
    for (const asNodeId of asNodes) {
      await delay(300);
      await callbackToAS(asNodeId, `/as/service/${svc.service_id}`, {
        node_id: asNodeId, type: 'data_request',
        request_id: requestId, mode: info.mode ?? 2,
        namespace: info.namespace, identifier: info.identifier,
        service_id: svc.service_id, requester_node_id: 'rp1',
        response_signature_list: [uid()], max_ial: 2.3, max_aal: 2.1,
        creation_time: Date.now(), creation_block_height: '1:100',
        request_timeout: info.request_timeout,
        ...(svc.request_params !== undefined ? { request_params: svc.request_params } : {}),
        ...(info.request_type ? { request_type: info.request_type } : {}),
      });
    }
  }

  // 6. Wait for AS(es) to send data
  await delay(2000);

  // 7. completed + closed
  const closedStatus = {
    node_id: 'rp1', type: 'request_status', request_id: requestId,
    requester_node_id: 'rp1', mode: info.mode ?? 2, request_message_hash: uid(),
    min_ial: 2.3, min_aal: 2.1, min_idp: 1,
    ...(info.request_type ? { request_type: info.request_type } : {}),
    idp_id_list: ['idp1'],
    response_list: [{ idp_id: 'idp1', ial: 2.3, aal: 2.1, status: 'accept',
      valid_signature: true, valid_ial: true }],
    data_request_list: makeDataReqList(true, true),
    request_timeout: info.request_timeout, closed: true, timed_out: false,
    status: 'completed', block_height: '1:120',
  };

  await callbackRP(cbPath, closedStatus);

  for (const svc of serviceList) {
    const asNodes = resolveAs(svc);
    for (const asNodeId of asNodes) {
      await callbackToAS(asNodeId, '/as/request_status_update', {
        node_id: asNodeId, type: 'request_status',
        request_id: requestId, requester_node_id: 'rp1', mode: info.mode ?? 2,
        request_message_hash: uid(), min_ial: 2.3, min_aal: 2.1, min_idp: 1,
        ...(info.request_type ? { request_type: info.request_type } : {}),
        idp_id_list: ['idp1'],
        response_list: [{ idp_id: 'idp1', ial: 2.3, aal: 2.1, status: 'accept' }],
        data_request_list: [{
          service_id: svc.service_id, as_id_list: asNodes, min_as: 1,
          request_params_hash: uid(),
          response_list: asNodes.map(id => ({ as_id: id, signed: true, received_data: true })),
        }],
        request_timeout: info.request_timeout, closed: true, timed_out: false,
        status: 'completed', block_height: '1:120',
      });
    }
  }

  console.log(`[NDID] ${requestId} DONE\n`);
}

// ─── Router factory ───────────────────────────────────────────────────────────

/**
 * Returns a request handler for one node role.
 * For AS nodes, asNodeId identifies which AS this server represents.
 */
function router(nodeRole, asNodeId) {
  return async (req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch {}
      const { method } = req;
      const url = req.url;
      console.log(`[${nodeRole}${asNodeId ? '/' + asNodeId : ''}] ${method} ${url}`);

      // ── Health ─────────────────────────────────────────────────────────────

      if (method === 'GET' && url === '/health')
        return respond(res, 200, { status: 'ok' });

      // ── IDP ────────────────────────────────────────────────────────────────

      if (method === 'POST' && url === '/v7/idp/callback')
        return respond(res, 204);

      if (method === 'GET' && url === '/v7/idp/callback')
        return respond(res, 200, {});

      if (method === 'POST' && url === '/v7/identity') {
        const requestId = 'req-' + uid();
        const accessorId = 'acc-' + uid();
        setTimeout(async () => {
          await callbackIDP('/idp/identity', {
            node_id: 'idp1', type: 'create_identity_request_result',
            reference_id: parsed.reference_id, request_id: requestId,
            accessor_id: accessorId, success: true, creation_block_height: '1:50',
          });
          await delay(500);
          await callbackIDP('/idp/identity', {
            node_id: 'idp1', type: 'create_identity_result',
            reference_id: parsed.reference_id, request_id: requestId,
            reference_group_code: uid(), success: true,
          });
        }, 500);
        return respond(res, 200, { request_id: requestId, accessor_id: accessorId });
      }

      if (method === 'POST' && url === '/v7/idp/response') {
        setTimeout(async () => {
          await callbackIDP('/idp/response', {
            node_id: 'idp1', type: 'response_result',
            reference_id: parsed.reference_id, request_id: parsed.request_id, success: true,
          });
        }, 200);
        return respond(res, 204);
      }

      if (method === 'GET' && url.startsWith('/v7/utility/idp'))
        return respond(res, 200, [{ node_id: 'idp1', name: 'IDP Example 1' }]);

      if (method === 'GET' && url.match(/^\/v7\/utility\/as\//)) {
        const serviceId = decodeURIComponent(url.split('/').pop());
        const nodes = Array.from(serviceRegistrations.get(serviceId) || []);
        return respond(res, 200, nodes.map(nodeId => ({ node_id: nodeId })));
      }

      // ── AS — service registration ──────────────────────────────────────────

      if (method === 'POST' && url === '/v7/yourdata/as/callback')
        return respond(res, 204);

      if (method === 'GET' && url === '/v7/yourdata/as/callback')
        return respond(res, 200, {});

      if (method === 'POST' && url.match(/^\/v7\/as\/service\//)) {
        // Respond with registration result callback to the AS that called us
        const targetAs = asNodeId || 'as1';
        const registeredServiceId = decodeURIComponent(url.split('/').pop());
        if (!serviceRegistrations.has(registeredServiceId)) serviceRegistrations.set(registeredServiceId, new Set());
        serviceRegistrations.get(registeredServiceId).add(targetAs);
        setTimeout(() => callbackToAS(targetAs, '/as/service', {
          node_id: targetAs, type: 'add_or_update_service_result',
          reference_id: parsed.reference_id, success: true,
        }), 300);
        return respond(res, 204);
      }

      if (method === 'POST' && url.match(/^\/v7\/yourdata\/as\/service\//))
        return respond(res, 204);

      if (method === 'GET' && url.match(/^\/v7\/yourdata\/as\/service\//))
        return respond(res, 200, { service_id: url.split('/').pop(), service_availability: true });

      // #11: Store auto_error_response config per AS node so orchestrateYourDataFlow
      // can auto-respond for services that fail platform pre-checks.
      if (method === 'POST' && url === '/v7/yourdata/as/auto_error_responses') {
        const nodeKey = asNodeId || 'as1';
        autoErrorResponses.set(nodeKey, { ...parsed });
        console.log(`  [stored auto_error_responses for ${nodeKey}]`);
        return respond(res, 204);
      }

      if (method === 'GET' && url === '/v7/yourdata/as/auto_error_responses')
        return respond(res, 200, autoErrorResponses.get(asNodeId || 'as1') || {});

      if (method === 'GET' && url === '/v7/yourdata/utility/as_error_codes')
        return respond(res, 200, [
          { error_code: 40000, error_message: 'Unknown Error' },
          { error_code: 40100, error_message: 'No Data' },
          { error_code: 40400, error_message: 'Invalid data' },
          { error_code: 40710, error_message: 'Date Range Exceeds Permission' },
          { error_code: 40720, error_message: 'Consent Token Revoked' },
          { error_code: 40730, error_message: 'One-Time Token Already Used' },
          { error_code: 40740, error_message: 'Unsupported service' },
          { error_code: 40750, error_message: 'Service not available' },
          { error_code: 40760, error_message: 'Unsupported namespace' },
          { error_code: 40770, error_message: 'Unsupported authorization' },
        ]);

      // AS sends Your Data response
      if (method === 'POST' && url === '/v7/yourdata/as/data') {
        yourDataRequestData.set(parsed.request_id, parsed.data);
        console.log(`  [stored YourData data for ${parsed.request_id}]`);
        return respond(res, 200);
      }

      if (method === 'POST' && url === '/v7/yourdata/as/error') {
        // Store error marker so orchestrateYourDataFlow can detect it and fire 'errored' callback
        // instead of waiting 15 seconds for data that will never arrive.
        yourDataRequestData.set(parsed.request_id, JSON.stringify({
          __error__: true,
          error_code: parsed.error_code,
          error_message: parsed.error_message,
        }));
        console.log(`  [AS error for ${parsed.request_id}: ${parsed.error_code} ${parsed.error_message}]`);
        return respond(res, 200);
      }

      // AS sends NDID data (pre-consent / revoke)
      if (method === 'POST' && url.match(/^\/v7\/as\/data\//)) {
        const parts = url.split('/');
        const requestId = parts[4];
        const serviceId = parts[5];
        if (!ndidRequests.has(requestId)) ndidRequests.set(requestId, {});
        const info = ndidRequests.get(requestId);
        if (!info.ndidData) info.ndidData = {};
        // Merge: multiple AS nodes may each send data for different services
        if (!info.ndidData[serviceId]) info.ndidData[serviceId] = {};
        const callerAs = asNodeId || 'as1';
        info.ndidData[serviceId][callerAs] = parsed.data;
        setTimeout(() => callbackToAS(callerAs, '/as/response', {
          node_id: callerAs, type: 'response_result',
          reference_id: parsed.reference_id, request_id: requestId, success: true,
        }), 200);
        return respond(res, 202);
      }

      // ── RP ─────────────────────────────────────────────────────────────────

      // Your Data request (complete-consent + data-request)
      if (method === 'POST' && url === '/v7/yourdata/rp/requests') {
        const requestId = 'yd-' + uid();
        yourDataRequests.set(requestId, { ...parsed });
        setTimeout(() => orchestrateYourDataFlow(requestId, parsed), 100);
        return respond(res, 200, { request_id: requestId });
      }

      if (method === 'GET' && url.match(/^\/v7\/yourdata\/rp\/request_data\//)) {
        const requestId = url.split('/').pop();
        const data = yourDataRequestData.get(requestId);
        if (!data) return respond(res, 404, { error: 'not found' });
        // Check for AS error marker
        try {
          const parsed = JSON.parse(data);
          if (parsed.__error__) {
            return respond(res, 200, [{
              source_node_id: yourDataRequests.get(requestId)?.as_node_id || 'as1',
              service_id: yourDataRequests.get(requestId)?.service_id || 'unknown',
              error: true,
              error_code: parsed.error_code,
              error_message: parsed.error_message,
            }]);
          }
        } catch {}
        return respond(res, 200, [{
          source_node_id: yourDataRequests.get(requestId)?.as_node_id || 'as1',
          service_id: yourDataRequests.get(requestId)?.service_id || 'unknown',
          source_signature: 'mock-sig',
          signature_signing_algorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
          signature_signing_key_version: 1,
          data_salt: uid(), data,
        }]);
      }

      if (method === 'GET' && url.match(/^\/v7\/yourdata\/rp\/request_references\//))
        return respond(res, 200, { reference_id: url.split('/').pop(), status: 'completed' });

      // #12/#13: Decryption key retry — fire status callbacks to RP's retry callback URL.
      // #23: Use 202 Accepted (async operation).
      if (method === 'POST' && url === '/v7/yourdata/rp/data_decryption_key_retry_requests') {
        const retryRequestId = parsed.request_id;
        const retryCbUrl = parsed.callback_url;
        const retryCbPath = retryCbUrl ? new URL(retryCbUrl).pathname : '/yourdata/rp/data_decryption_key_retry_request_status_update';
        setTimeout(async () => {
          // pending → completed: decryption key retrieved successfully
          await callbackRP(retryCbPath, {
            type: 'yourdata.data_decryption_key_retry_request_status_update',
            node_id: 'rp1', request_id: retryRequestId,
            reference_id: parsed.reference_id,
            status: 'pending',
          });
          await delay(400);
          await callbackRP(retryCbPath, {
            type: 'yourdata.data_decryption_key_retry_request_status_update',
            node_id: 'rp1', request_id: retryRequestId,
            reference_id: parsed.reference_id,
            status: 'completed',
          });
        }, 300);
        return respond(res, 202);
      }

      if (method === 'POST' && url.match(/^\/v7\/yourdata\/rp\/request_data_removal/))
        return respond(res, 204);

      // NDID request (pre-consent / revoke)
      if (method === 'POST' && url.match(/^\/v7\/rp\/requests\//)) {
        const parts = url.split('/');
        const namespace = parts[4];
        const identifier = parts[5];
        const requestId = 'ndid-' + uid();
        const dataRequestListFull = parsed.data_request_list || [];
        ndidRequests.set(requestId, {
          ...parsed, namespace, identifier,
          data_request_list_full: dataRequestListFull,
        });
        setTimeout(() => orchestrateNdidFlow(requestId, {
          ...parsed, namespace, identifier,
          data_request_list_full: dataRequestListFull,
        }), 100);
        return respond(res, 202, { request_id: requestId, initial_salt: uid() });
      }

      if (method === 'GET' && url.match(/^\/v7\/rp\/request_data\//)) {
        const requestId = url.split('/').pop();
        const info = ndidRequests.get(requestId);
        if (!info?.ndidData) return respond(res, 200, []);
        // Flatten: service_id → { asNodeId → data } into array of entries
        const entries = [];
        for (const [service_id, asMap] of Object.entries(info.ndidData)) {
          for (const [asId, data] of Object.entries(asMap)) {
            entries.push({ source_node_id: asId, service_id, source_signature: 'mock-sig', data });
          }
        }
        return respond(res, 200, entries);
      }

      // ── Shared ─────────────────────────────────────────────────────────────

      if (method === 'POST' && url === '/v7/yourdata/utility/token') {
        // Build a minimal fake-JWT so AS can decode the token payload without a real crypto stack.
        // Format: base64url(header).base64url(payload).mock-sig
        // Echo the entire request body into the payload (like the real NDID platform's
        // /yourdata/utility/token endpoint does per YourDataConsentTokenPayload) so the AS
        // can read back as_node_id, source_request_id_list, service_id_list[0].service_extension[0], etc.
        const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const header = { alg: 'mock', typ: 'JWT' };
        const payload = {
          token_id: `mock-token-${tokenCounter++}-${uid()}`,
          issue_datetime: Date.now(),
          ...parsed,
        };
        const token = `${b64(header)}.${b64(payload)}.mock-sig`;
        return respond(res, 200, { token });
      }

      if (method === 'GET' && url.startsWith('/v7/yourdata/utility'))
        return respond(res, 200, {});

      // Fallback
      console.log(`  [unhandled] ${method} ${url}`);
      return respond(res, 404, { error: `not implemented: ${method} ${url}` });
    });
  };
}

function respond(res, status, body) {
  const json = body !== undefined ? JSON.stringify(body) : '';
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

// ─── Start ────────────────────────────────────────────────────────────────────

function listen(server, port, label) {
  server.on('error', (err) => {
    console.error(`✗ ${label} failed to bind :${port} — ${err.code}. Kill existing processes first.`);
    process.exit(1);
  });
  server.listen(port, () => console.log(`${label}  :${port}`));
}

listen(http.createServer(router('idp')),       PORTS.idp, 'Mock IDP API ');
listen(http.createServer(router('rp')),        PORTS.rp,  'Mock RP API  ');

for (const [nodeId, cfg] of Object.entries(AS_NODES)) {
  listen(http.createServer(router('as', nodeId)), cfg.apiPort, `Mock AS API  (${nodeId})`);
}
