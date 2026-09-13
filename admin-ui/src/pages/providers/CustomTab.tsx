import type { Dispatch, SetStateAction } from "react";
import { Button, Spinner } from "../../components/UI";
import type {
  CustomProvider,
  CustomProviderTestResult,
} from "../../api/client";

export interface EditFormState {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
}

export interface CustomTabProps {
  editForm: EditFormState | null;
  setEditForm: Dispatch<SetStateAction<EditFormState | null>>;
  saveCustomProvider: () => void;
  closeEditForm: () => void;
  openCreateForm: () => void;
  customLoading: boolean;
  customProviders: CustomProvider[];
  openEditForm: (p: CustomProvider) => void;
  handleTestCustom: (id: string, name: string) => void;
  handleFetchModels: (id: string, name: string) => void;
  handleCheckBalance: (id: string, name: string) => void;
  handleDeleteCustom: (id: string, name: string) => void;
  testModal: { id: string; name: string; result: CustomProviderTestResult } | null;
  setTestModal: Dispatch<SetStateAction<{ id: string; name: string; result: CustomProviderTestResult } | null>>;
  viewModels: { id: string; name: string; models: string[]; error?: string } | null;
  setViewModels: Dispatch<SetStateAction<{ id: string; name: string; models: string[]; error?: string } | null>>;
  viewBalance: { id: string; name: string; balance?: string; error?: string } | null;
  setViewBalance: Dispatch<SetStateAction<{ id: string; name: string; balance?: string; error?: string } | null>>;
}

export function CustomTab({
  editForm,
  setEditForm,
  saveCustomProvider,
  closeEditForm,
  openCreateForm,
  customLoading,
  customProviders,
  openEditForm,
  handleTestCustom,
  handleFetchModels,
  handleCheckBalance,
  handleDeleteCustom,
  testModal,
  setTestModal,
  viewModels,
  setViewModels,
  viewBalance,
  setViewBalance,
}: CustomTabProps) {
  return (
  <div>
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm text-text-muted">
        Manage custom API providers.
      </p>
      <Button onClick={openCreateForm}>Add Custom Provider</Button>
    </div>

    {/* Inline Edit / Create Form */}
    {editForm && (
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          {editForm.id ? "Edit Provider" : "New Provider"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Name</label>
            <input
              className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="My Provider"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Base URL</label>
            <input
              className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
              value={editForm.baseUrl}
              onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">API Key (optional)</label>
            <input
              className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
              value={editForm.apiKey}
              onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
              placeholder="sk-..."
              type="password"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Models (comma-separated, optional)
            </label>
            <input
              className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
              value={editForm.models}
              onChange={(e) => setEditForm({ ...editForm, models: e.target.value })}
              placeholder="gpt-4, claude-3"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveCustomProvider}>
            {editForm.id ? "Update" : "Create"}
          </Button>
          <Button variant="secondary" onClick={closeEditForm}>
            Cancel
          </Button>
        </div>
      </div>
    )}

    {/* Custom Provider List */}
    {customLoading ? (
      <div className="flex justify-center py-12">
        <Spinner size={32} />
      </div>
    ) : customProviders.length === 0 ? (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <p className="text-text-muted text-sm">No custom providers yet.</p>
        <p className="text-text-muted text-xs mt-1">
          Click "Add Custom Provider" to get started.
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-3 text-text-muted font-medium">Name</th>
              <th className="text-left py-3 px-3 text-text-muted font-medium">Base URL</th>
              <th className="text-left py-3 px-3 text-text-muted font-medium">Models</th>
              <th className="text-left py-3 px-3 text-text-muted font-medium">Updated</th>
              <th className="text-right py-3 px-3 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customProviders.map((p) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-[#0a0a14]/40">
                <td className="py-3 px-3 text-text-primary font-medium">{p.name}</td>
                <td className="py-3 px-3 text-text-muted max-w-[200px] truncate">
                  <code className="text-xs">{p.baseUrl}</code>
                </td>
                <td className="py-3 px-3 text-text-muted">
                  {p.models && p.models.length > 0
                    ? p.models.slice(0, 2).join(", ") +
                      (p.models.length > 2 ? ` +${p.models.length - 2}` : "")
                    : "-"}
                </td>
                <td className="py-3 px-3 text-text-muted text-xs">
                  {p.updated_at
                    ? new Date(p.updated_at).toLocaleDateString()
                    : p.created_at
                      ? new Date(p.created_at).toLocaleDateString()
                      : "-"}
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button
                      variant="ghost"
                      onClick={() => openEditForm(p)}
                      className="!px-2 !py-1 text-xs"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleTestCustom(p.id, p.name)}
                      className="!px-2 !py-1 text-xs"
                    >
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleFetchModels(p.id, p.name)}
                      className="!px-2 !py-1 text-xs"
                    >
                      Models
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleCheckBalance(p.id, p.name)}
                      className="!px-2 !py-1 text-xs"
                    >
                      Balance
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleDeleteCustom(p.id, p.name)}
                      className="!px-2 !py-1 text-xs text-red-400"
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* Test Result Modal */}
    {testModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTestModal(null)}>
        <div
          className="bg-surface border border-border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Test Result: {testModal.name}
          </h3>
          <div className="mb-3">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                testModal.result.success
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {testModal.result.success ? "Success" : "Failed"}
            </span>
            {testModal.result.error && (
              <p className="text-red-400 text-xs mt-2">{testModal.result.error}</p>
            )}
          </div>
          {testModal.result.response && (
            <div className="bg-[#0a0a14] border border-border rounded-lg p-3 mb-3">
              <p className="text-xs text-text-muted mb-1">Response:</p>
              <pre className="text-xs text-text-primary whitespace-pre-wrap overflow-x-auto">
                {typeof testModal.result.response === "string"
                  ? testModal.result.response
                  : JSON.stringify(testModal.result.response, null, 2)}
              </pre>
            </div>
          )}
          <Button variant="secondary" onClick={() => setTestModal(null)}>
            Close
          </Button>
        </div>
      </div>
    )}

    {/* Fetch Models Modal */}
    {viewModels && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewModels(null)}>
        <div
          className="bg-surface border border-border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Models: {viewModels.name}
          </h3>
          {viewModels.error ? (
            <p className="text-red-400 text-sm">{viewModels.error}</p>
          ) : viewModels.models.length === 0 ? (
            <p className="text-text-muted text-sm">No models found.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {viewModels.models.map((m) => (
                <span
                  key={m}
                  className="text-xs px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/30 text-text-muted"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setViewModels(null)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* Balance Modal */}
    {viewBalance && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewBalance(null)}>
        <div
          className="bg-surface border border-border rounded-xl p-5 max-w-sm w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Balance: {viewBalance.name}
          </h3>
          {viewBalance.error ? (
            <p className="text-red-400 text-sm">{viewBalance.error}</p>
          ) : (
            <div className="text-lg font-bold text-green-400">
              {viewBalance.balance ? `$${viewBalance.balance}` : "$0.00"}
            </div>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setViewBalance(null)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
