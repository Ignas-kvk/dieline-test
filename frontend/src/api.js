const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function calculateDieline({ file, payload }) {
  const form = new FormData();
  form.append("file", file);
  form.append("payload", JSON.stringify(payload));

  const res = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return await res.json();
}

export async function detectStrokeColors({ file, payload }) {
  const form = new FormData();
  form.append("file", file);
  form.append("payload", JSON.stringify(payload));

  const res = await fetch(`${API_BASE}/stroke-colors`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return await res.json();
}
