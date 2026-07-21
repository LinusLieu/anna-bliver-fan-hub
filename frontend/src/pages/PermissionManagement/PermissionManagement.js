import React, { useEffect, useMemo, useState } from 'react';
import { permissionService, settingsService } from '../../services';
import './PermissionManagement.css';

export default function PermissionManagement() {
  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({ role: 'user', permissions: [] });
  const [registrationOpen, setRegistrationOpen] = useState(true);

  const selected = useMemo(() => users.find((user) => user.id === selectedId), [users, selectedId]);

  const load = async () => {
    const [nextUsers, nextTypes, registration] = await Promise.all([
      permissionService.getAllUsers(),
      permissionService.getPermissionTypes(),
      settingsService.getRegistrationStatus()
    ]);
    setUsers(nextUsers);
    setTypes(nextTypes);
    setRegistrationOpen(registration.registrationOpen);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selected) setDraft({ role: selected.role, permissions: selected.permissions || [] });
  }, [selected]);

  const togglePermission = (key) => setDraft((current) => ({
    ...current,
    permissions: current.permissions.includes(key)
      ? current.permissions.filter((item) => item !== key)
      : [...current.permissions, key]
  }));

  const save = async () => {
    await permissionService.updateUserPermissions(selectedId, draft.permissions, draft.role);
    await load();
  };

  const toggleRegistration = async () => {
    const result = await settingsService.updateRegistrationStatus(!registrationOpen);
    setRegistrationOpen(result.registrationOpen);
  };

  return (
    <div className="permission-management">
      <header className="page-header">
        <h1>用户与权限</h1>
        <label className="registration-toggle">
          开放注册
          <input type="checkbox" checked={registrationOpen} onChange={toggleRegistration} />
        </label>
      </header>
      <div className="permission-layout">
        <div className="user-list">
          {users.map((user) => (
            <button key={user.id} className={user.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(user.id)}>
              <strong>{user.username}</strong><span>{user.email}</span>
            </button>
          ))}
        </div>
        <section className="permission-editor">
          {!selected && <p>选择一个用户进行编辑。</p>}
          {selected && <>
            <h2>{selected.username}</h2>
            <label>角色
              <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
                <option value="user">普通用户</option>
                <option value="premium">协作者</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <div className="permission-options">
              {types.map((type) => <label key={type.key}>
                <input type="checkbox" checked={draft.permissions.includes(type.key)} onChange={() => togglePermission(type.key)} />
                {type.name}
              </label>)}
            </div>
            <button type="button" onClick={save}>保存权限</button>
          </>}
        </section>
      </div>
    </div>
  );
}
