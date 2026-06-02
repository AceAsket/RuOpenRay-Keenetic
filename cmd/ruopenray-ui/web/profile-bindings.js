export function bindProfileControls({
  state,
  activateProfile,
  openProfileEditor,
  deleteProfile,
  downloadProfile
}) {
  document.querySelectorAll('[data-profile]').forEach((button) => {
    button.addEventListener('click', () => activateProfile(button.dataset.profile));
  });
  document.querySelectorAll('[data-profile-edit]').forEach((button) => {
    button.addEventListener('click', () => openProfileEditor(button.dataset.profileEdit));
  });
  document.querySelectorAll('[data-profile-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteProfile(button.dataset.profileDelete));
  });
  document.querySelectorAll('[data-profile-download]').forEach((button) => {
    button.addEventListener('click', () => downloadProfile(button.dataset.profileDownload));
  });
  document.querySelectorAll('[data-profile-download-anonymized]').forEach((button) => {
    button.addEventListener('click', () => downloadProfile(button.dataset.profileDownloadAnonymized, { anonymized: true }));
  });
  document.querySelector('#profileEditName')?.addEventListener('input', (event) => {
    state.profileEditName = event.target.value;
  });
  document.querySelector('#profileEditDraft')?.addEventListener('input', (event) => {
    state.profileEditDraft = event.target.value;
  });
}
