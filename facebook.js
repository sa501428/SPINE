import { SPINE_CONFIG } from "./config.js";

const appId = String(SPINE_CONFIG.facebookAppId ?? "").trim();
const apiVersion = String(SPINE_CONFIG.facebookApiVersion ?? "v25.0").trim();

export function facebookIsConfigured() {
  return Boolean(appId);
}

export function facebookConfigLabel() {
  return appId ? `App ${appId.slice(0, 6)}…${appId.slice(-3)}` : "App ID needed";
}

export async function loadFacebookSdk() {
  if (!appId) {
    throw new Error(
      "Facebook is not configured yet. Add the public App ID in config.js and reload the site.",
    );
  }
  if (window.FB) return window.FB;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Facebook took too long to load. Check content blockers and retry.")),
      12000,
    );

    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);
      if (!window.FB) {
        reject(new Error("The Facebook SDK did not initialize."));
        return;
      }
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: apiVersion,
      });
      resolve(window.FB);
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Facebook could not be reached. Check your connection or content blocker."));
    };
    document.head.appendChild(script);
  });
}

function apiCall(sdk, path, params) {
  return new Promise((resolve, reject) => {
    const complete = (response) => {
      if (response?.error) {
        reject(new Error(response.error.message || "Facebook returned an error."));
        return;
      }
      resolve(response ?? {});
    };
    if (params) sdk.api(path, "get", params, complete);
    else sdk.api(path, complete);
  });
}

async function collectPaged(sdk, initialPath, initialParams, onPage) {
  const items = [];
  let path = initialPath;
  let params = initialParams;
  while (path) {
    const response = await apiCall(sdk, path, params);
    const pageItems = response.data ?? [];
    items.push(...pageItems);
    onPage?.(pageItems.length);
    path = response.paging?.next;
    params = undefined;
  }
  return items;
}

async function completeTags(sdk, photo) {
  const tags = [...(photo.tags?.data ?? [])];
  let next = photo.tags?.paging?.next;
  while (next) {
    const response = await apiCall(sdk, next);
    tags.push(...(response.data ?? []));
    next = response.paging?.next;
  }
  return [...new Map(tags.map((tag) => [String(tag.id), tag])).values()].filter(
    (tag) => tag.id && tag.name,
  );
}

export async function importFacebookPhotos(onProgress) {
  const sdk = await loadFacebookSdk();
  const login = await new Promise((resolve) => {
    sdk.login(resolve, {
      scope: "public_profile,user_photos",
      return_scopes: true,
    });
  });
  if (!login.authResponse) {
    throw new Error("Facebook access was not granted.");
  }

  const byId = new Map();
  let loaded = 0;
  const query = {
    fields: "id,created_time,tags.limit(100){id,name}",
    limit: 100,
  };
  for (const type of ["uploaded", "tagged"]) {
    const photos = await collectPaged(
      sdk,
      `/me/photos`,
      { ...query, type },
      (count) => {
        loaded += count;
        onProgress(`Reading ${type} photo tags`, loaded);
      },
    );
    photos.forEach((photo) => byId.set(photo.id, photo));
  }

  const records = [];
  let processed = 0;
  for (const photo of byId.values()) {
    const tags = await completeTags(sdk, photo);
    records.push({
      id: photo.id,
      createdTime: photo.created_time,
      tags,
    });
    processed += 1;
    if (processed % 5 === 0 || processed === byId.size) {
      onProgress(`Processing tag records`, processed);
    }
  }
  return records;
}

export async function facebookLogout() {
  if (!window.FB) return;
  await new Promise((resolve) => window.FB?.logout(() => resolve()));
}
