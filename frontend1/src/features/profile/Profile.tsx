import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveBackendOrigin } from "../../services/apiBase";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { getProfile, updateProfile, uploadAvatar, changePassword, type ProfileResponse } from "../../services/profile";

const BACKEND_ORIGIN = getActiveBackendOrigin();

function resolveBackendUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("data:")) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${BACKEND_ORIGIN}/${normalized}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + (b ?? "")).toUpperCase();
}

export default function Profile() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [phone, setPhone] = useState("");
  const [boardCertified, setBoardCertified] = useState(true);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const avatar = useMemo(() => resolveBackendUrl(data?.avatar_url ?? ""), [data?.avatar_url]);

  async function load() {
    setError(null);
    setIsLoading(true);
    try {
      const p = await getProfile();
      setData(p);
      setName(p.name);
      setTitle(p.title);
      setHospitalName(p.hospital_name);
      setPhone(p.phone);
      setBoardCertified(p.board_certified);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load profile";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    if (!data) return;
    setSaveError(null);
    setSaveLoading(true);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        title: title.trim(),
        hospital_name: hospitalName.trim(),
        phone: phone.trim(),
        board_certified: boardCertified,
      });
      setData(updated);
      setIsEditing(false);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to save profile";
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function onPickAvatar(file: File | null) {
    if (!file || !data) return;
    setSaveError(null);
    setSaveLoading(true);
    try {
      const res = await uploadAvatar(file);
      const merged = { ...data, avatar_url: res.avatar_url };
      setData(merged);
    } catch {
      setSaveError("Failed to upload avatar");
    } finally {
      setSaveLoading(false);
    }
  }

  async function onChangePassword() {
    setPwError(null);
    setPwSuccess(null);
    if (!pwCurrent || !pwNext) return setPwError("Enter your current and new password.");
    if (pwNext.length < 6) return setPwError("New password must be at least 6 characters.");
    if (pwNext !== pwConfirm) return setPwError("New password and confirmation do not match.");

    setPwLoading(true);
    try {
      await changePassword({ current_password: pwCurrent, new_password: pwNext });
      setPwSuccess("Password updated successfully.");
      setPwCurrent("");
      setPwNext("");
      setPwConfirm("");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to change password";
      setPwError(message);
    } finally {
      setPwLoading(false);
    }
  }

  const inputClass =
    "block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent transition-all outline-none";

  const modalInput =
    "block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent outline-none";

  const stats = data?.stats;
  const avgConfidencePct = stats ? stats.avg_confidence * 100 : 0;

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">Profile</h1>
          <p className="text-on-surface-variant text-lg">
            Manage your account info, profile details, and security.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon="refresh" onClick={load} disabled={isLoading}>
            Refresh
          </Button>
          {isEditing ? (
            <>
              <Button variant="ghost" icon="close" onClick={() => setIsEditing(false)} disabled={saveLoading}>
                Cancel
              </Button>
              <Button icon="save" onClick={onSave} disabled={saveLoading}>
                {saveLoading ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button icon="edit" onClick={() => setIsEditing(true)} disabled={!data || isLoading}>
              Edit Profile
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card className="p-5 mb-8 border border-error/25 bg-error-container/20">
          <div className="text-error font-semibold">{error}</div>
          <div className="text-on-surface-variant text-sm mt-1">
            Make sure the backend is running and you&apos;re logged in.
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="p-8">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
            />

            <div className="flex flex-col md:flex-row items-center gap-8 mb-10">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-32 h-32 rounded-full bg-surface-container-highest border-4 border-primary/20 flex items-center justify-center text-primary overflow-hidden relative group focus:outline-none focus:ring-2 focus:ring-primary/30"
                title="Upload avatar"
              >
                {avatar ? (
                  <img alt="Avatar" src={avatar} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-headline font-extrabold text-3xl text-on-surface">
                    {data ? initials(data.name) : "—"}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-black/40">
                  <span className="material-symbols-outlined text-on-surface">photo_camera</span>
                </div>
              </button>

              <div className="text-center md:text-left w-full">
                <h2 className="text-3xl font-headline font-bold text-on-surface">
                  {isEditing ? (
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                  ) : (
                    data?.name ?? (isLoading ? "Loading…" : "—")
                  )}
                </h2>
                <div className="mt-3">
                  {isEditing ? (
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClass}
                      placeholder="Title (e.g. Ophthalmologist)"
                    />
                  ) : (
                    <p className="text-primary font-bold tracking-widest uppercase text-xs">
                      {data?.title ?? "—"}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-5">
                  <div className="bg-surface-container px-3 py-1 rounded-full text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">location_on</span>
                    {isEditing ? (
                      <input
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        className="bg-transparent outline-none w-48"
                        placeholder="Hospital / Clinic"
                      />
                    ) : (
                      data?.hospital_name ?? "—"
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => isEditing && setBoardCertified((v) => !v)}
                    className={`bg-surface-container px-3 py-1 rounded-full text-xs flex items-center gap-1 transition-colors ${
                      boardCertified ? "text-on-surface-variant" : "text-outline"
                    } ${isEditing ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
                    title={isEditing ? "Toggle board certification" : "Board certification"}
                  >
                    <span className="material-symbols-outlined text-sm">verified</span>
                    {boardCertified ? "Board Certified" : "Not Certified"}
                  </button>
                </div>
              </div>
            </div>

            {saveError && (
              <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm mb-6">{saveError}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Email Address</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface font-body">
                    {data?.email ?? "—"}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Phone Number</label>
                {isEditing ? (
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Phone" />
                ) : (
                  <div className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface font-body">
                    {data?.phone || "—"}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-headline font-bold text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">lock</span>
                  Account Security
                </h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  Update your password regularly to keep your account secure.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  icon="key"
                  onClick={() => {
                    setPwError(null);
                    setPwSuccess(null);
                    setPwOpen(true);
                  }}
                >
                  Change Password
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-8 bg-gradient-to-br from-primary-container/10 to-transparent border border-primary/10">
            <h3 className="font-headline font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">insights</span>
              Performance
            </h3>

            <div className="space-y-6">
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">Patients</p>
                <p className="text-2xl font-headline font-extrabold text-on-surface">{stats?.patients ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">Reports</p>
                <p className="text-2xl font-headline font-extrabold text-on-surface">{stats?.reports ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">Critical cases</p>
                <p className="text-2xl font-headline font-extrabold text-on-surface">{stats?.critical_cases ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">Avg confidence</p>
                <p className="text-2xl font-headline font-extrabold text-on-surface">
                  {stats ? `${avgConfidencePct.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-headline font-bold mb-3 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
              Account
            </h3>
            <div className="text-sm text-on-surface-variant space-y-2">
              <div className="flex items-center justify-between">
                <span>User ID</span>
                <span className="text-on-surface font-semibold">{data?.id ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Certification</span>
                <span className="text-on-surface font-semibold">{boardCertified ? "Verified" : "—"}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {pwOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Change password dialog"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPwOpen(false)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-lg">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">Change password</div>
                  <div className="text-sm text-on-surface-variant mt-1">
                    Choose a strong password (min 6 characters).
                  </div>
                </div>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-primary transition-colors"
                  onClick={() => setPwOpen(false)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className={modalInput}
                  placeholder="Current password"
                />
                <input
                  type="password"
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  className={modalInput}
                  placeholder="New password"
                />
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className={modalInput}
                  placeholder="Confirm new password"
                />
                {pwError && (
                  <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">{pwError}</div>
                )}
                {pwSuccess && (
                  <div className="rounded-xl bg-primary-container/15 text-on-surface px-4 py-3 text-sm">{pwSuccess}</div>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse md:flex-row gap-3 md:justify-end">
                <Button variant="ghost" onClick={() => setPwOpen(false)} disabled={pwLoading} icon="close">
                  Cancel
                </Button>
                <Button onClick={onChangePassword} disabled={pwLoading} icon="key">
                  {pwLoading ? "Updating..." : "Update password"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
