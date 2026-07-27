import { useState, useEffect, FormEvent } from "react";
import { Input, Button, Spinner, StatusBadge, Toast } from "../../components/UI";
import { fetchFanpages, createFanpage, updateFanpage, deleteFanpage, type Fanpage as FanpageData, FanpageInput } from "../../api/client";

export default function Fanpage() {
  const [pages, setPages] = useState<FanpageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FanpageData | null>(null);
  const [form, setForm] = useState<FanpageInput>({
    userId: "",
    pageId: "",
    pageName: "",
    accessToken: "",
    category: "",
    fanCount: 0,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadPages = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchFanpages();
      setPages(data);
    } catch (err: unknown) {
      setErr(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPages(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ userId: "", pageId: "", pageName: "", accessToken: "", category: "", fanCount: 0, isActive: true });
    setShowModal(true);
  };

  const openEdit = (page: FanpageData) => {
    setEditing(page);
    setForm({
      userId: page.userId,
      pageId: page.pageId,
      pageName: page.pageName,
      accessToken: page.accessToken,
      category: page.category || "",
      fanCount: page.fanCount || 0,
      isActive: page.isActive,
    });
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateFanpage(editing.id, form);
        setToast({ message: "Fanpage updated", type: "success" });
      } else {
        await createFanpage(form);
        setToast({ message: "Fanpage created", type: "success" });
      }
      setShowModal(false);
      await loadPages();
    } catch (err: unknown) {
      setToast({ message: String(err), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this fanpage?")) return;
    try {
      await deleteFanpage(id);
      setToast({ message: "Fanpage deleted", type: "success" });
      await loadPages();
    } catch (err: unknown) {
      setToast({ message: String(err), type: "error" });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Fanpage Manager</h2>
        <Button onClick={openCreate}>Add Fanpage</Button>
      </div>

      {loading && <Spinner />}
      {err && <p className="text-red-400">{err}</p>}

      {!loading && !err && pages.length === 0 && (
        <p className="text-gray-400">No fanpages registered.</p>
      )}

      {!loading && pages.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-2">Page Name</th>
                <th className="p-2">Page ID</th>
                <th className="p-2">Category</th>
                <th className="p-2">Fans</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id} className="border-b border-gray-700 hover:bg-gray-800">
                  <td className="p-2">{page.pageName}</td>
                  <td className="p-2 text-gray-400 font-mono text-xs">{page.pageId}</td>
                  <td className="p-2">{page.category || "—"}</td>
                  <td className="p-2">{page.fanCount ?? "—"}</td>
                  <td className="p-2">
                    <StatusBadge
                      status={page.isActive ? "active" : "inactive"}
                      mapping={{ active: "Active", inactive: "Inactive" }}
                    />
                  </td>
                  <td className="p-2 space-x-2">
                    <Button onClick={() => openEdit(page)} variant="secondary" className="text-xs">
                      Edit
                    </Button>
                    <Button onClick={() => handleDelete(page.id)} variant="danger" className="text-xs">
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editing ? "Edit Fanpage" : "Add Fanpage"}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <Input label="Page Name" name="pageName" value={form.pageName} onChange={(e) => setForm({ ...form, pageName: e.target.value })} required />
              <Input label="Page ID" name="pageId" value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} required />
              <Input label="User ID" name="userId" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required />
              <Input label="Access Token" name="accessToken" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} required />
              <Input label="Category" name="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input label="Fan Count" name="fanCount" type="number" value={String(form.fanCount)} onChange={(e) => setForm({ ...form, fanCount: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="accent-purple-500"
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="primary" loading={saving}>
                  Save
                </Button>
                <Button onClick={() => setShowModal(false)} variant="secondary">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
