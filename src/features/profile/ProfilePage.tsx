import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, friendlyAuthError } from '../auth/AuthProvider';
import { useDb, useMyProfile, usePlan, useRun } from '../../lib/data';
import { Avatar } from '../../components/Avatar';
import { EmojiPicker } from '../../components/EmojiPicker';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { isValidEmail } from '../../lib/utils';
import type { Visibility } from '../../lib/types';

const MAX_PHOTO = 2 * 1024 * 1024;

export function ProfilePage() {
  const { user } = useAuth();
  const me = useMyProfile();
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('groups');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load profile + private phone once.
  useEffect(() => {
    if (!me || loaded || !user) return;
    setName(me.display_name);
    setEmoji(me.emoji);
    setPhoto(me.avatar_url);
    setVisibility(me.visibility);
    supabase.from('profile_contacts').select('phone').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      setPhone(data?.phone ?? '');
      setLoaded(true);
    });
  }, [me, user, loaded]);

  if (!user || !me) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.push('Your name cannot be empty.', 'error');
    await run(async () => {
      const { error } = await supabase.from('profiles').upsert({
        user_id: user!.id, display_name: name.trim(), emoji, avatar_url: photo, visibility, prefs: me!.prefs,
      });
      if (error) throw error;
      const c = await supabase.from('profile_contacts').upsert({ user_id: user!.id, phone: phone.trim() || null });
      if (c.error) throw c.error;
      // keep the cached member display name in step so it shows in places that cannot read the profile
      await db.refresh('profiles');
    }, 'Profile saved');
  }

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return toast.push('Choose an image file.', 'error');
    if (file.size > MAX_PHOTO) return toast.push('Photo must be 2 MB or smaller.', 'error');
    setUploading(true);
    await run(async () => {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      const path = `${user!.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setPhoto(data.publicUrl);
      setEmoji(null);
    }, 'Photo uploaded. Save your profile to keep it.');
    setUploading(false);
  }

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(newEmail)) return toast.push('Enter a valid email address.', 'error');
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: window.location.origin });
      if (error) throw error;
      toast.push('Check both inboxes to confirm the email change.', 'success');
      setNewEmail('');
    } catch (err) { toast.push(friendlyAuthError((err as Error).message), 'error'); }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return toast.push('Password must be at least 8 characters.', 'error');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.push('Password updated.', 'success');
      setNewPassword('');
    } catch (err) { toast.push(friendlyAuthError((err as Error).message), 'error'); }
  }

  return (
    <div className="page narrow">
      <div className="page-head"><h1>Profile</h1></div>

      <form className="card" onSubmit={saveProfile}>
        <h2>How you appear to others</h2>
        <div className="profile-preview">
          <Avatar name={name} emoji={emoji} url={photo} size={88} />
          <div className="grow">
            <div className="row-gap">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              <button type="button" className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload photo'}</button>
              {photo && <button type="button" className="btn btn-small" onClick={() => setPhoto(null)}>Remove photo</button>}
            </div>
            <p className="muted small">Without a photo or emoji you get a blue monogram of your first initial.</p>
          </div>
        </div>

        <div className="field"><span>Emoji profile picture</span>
          <EmojiPicker value={emoji} onChange={(v) => { setEmoji(v); setPhoto(null); }} allowNone onClear={() => setEmoji(null)} label="Profile emoji" />
        </div>
        <label className="field"><span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <label className="field"><span>Phone <small className="muted">(optional, only visible to you)</small></span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} autoComplete="tel" />
        </label>
        <label className="field"><span>Who can see my name and picture</span>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="groups">People in my groups</option>
            <option value="public">Any TananCal user</option>
            <option value="private">Nobody (shown as a plain member name)</option>
          </select>
        </label>
        <div className="modal-actions left"><button className="btn btn-primary">Save profile</button></div>
      </form>

      <section className="card">
        <h2>Account</h2>
        <p>Signed in as <strong>{user.email}</strong></p>
        <form className="inline-form" onSubmit={changeEmail} noValidate>
          <input type="email" aria-label="New email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
          <button className="btn">Change email</button>
        </form>
        <form className="inline-form" onSubmit={changePassword}>
          <input type="password" aria-label="New password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <button className="btn">Change password</button>
        </form>
      </section>

      <section className="card">
        <h2>Delete account</h2>
        <p className="muted">Permanently removes your account and memberships. Transfer ownership of, or delete, any groups you own first.</p>
        <button className="btn btn-danger" onClick={() => setDeleting(true)}>Delete my account</button>
      </section>

      {deleting && (
        <DeleteAccountDialog onClose={() => setDeleting(false)} />
      )}
    </div>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { roleIn, groups } = usePlan();
  const run = useRun();
  const owned = groups.filter((g) => roleIn(g.id) === 'owner');
  return (
    <ConfirmDialog
      title="Delete account" danger confirmLabel="Delete my account" requireText={user?.email ?? 'DELETE'}
      message={owned.length
        ? <>You still own: <strong>{owned.map((g) => g.name).join(', ')}</strong>. Transfer or delete them first, or this will be rejected.</>
        : <>This cannot be undone.</>}
      onClose={onClose}
      onConfirm={async () => {
        if (await run(async () => { const { error } = await supabase.rpc('delete_my_account'); if (error) throw error; }, 'Account deleted')) {
          await supabase.auth.signOut();
        }
      }}
    />
  );
}
