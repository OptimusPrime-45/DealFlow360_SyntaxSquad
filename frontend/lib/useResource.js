"use client";

/**
 * useResource — a tiny load/create/update/delete hook for the admin screens.
 *
 * Every config page does the same four things against a REST collection, so
 * they share this instead of each re-implementing loading flags and error
 * handling. Deliberately small and explicit: no caching, no magic. Each page
 * still writes its own form and table, because those are what actually differ.
 */

import { useState, useEffect, useCallback } from "react";
import apiClient from "./apiClient.js";

/**
 * @param {string} path      collection path, e.g. "/warehouses"
 * @param {string} pick      key to read out of the response envelope, e.g. "warehouses"
 */
export function useResource(path, pick) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await apiClient.get(path);
      setItems(data?.[pick] ?? (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path, pick]);

  useEffect(() => {
    load();
  }, [load]);

  /** Run a mutation, then refresh. Returns true on success. */
  const run = useCallback(
    async (fn, successMessage) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await fn();
        if (successMessage) setNotice(successMessage);
        await load();
        return true;
      } catch (err) {
        setError(err.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const create = (body, msg) => run(() => apiClient.post(path, body), msg);
  const update = (id, body, msg) => run(() => apiClient.patch(`${path}/${id}`, body), msg);
  const remove = (id, msg) => run(() => apiClient.delete(`${path}/${id}`), msg);

  return {
    items,
    loading,
    busy,
    error,
    notice,
    setError,
    setNotice,
    reload: load,
    run,
    create,
    update,
    remove,
  };
}

export default useResource;
