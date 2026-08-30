/**
 * edit-modal.js
 * Interface para o usuário sobrescrever manualmente a capa, o nome exibido
 * e a sinopse de um anime, para os casos em que a busca automática (Jikan
 * API) não encontra o título ou encontra o anime errado.
 *
 * A imagem escolhida do computador é convertida em Data URL e salva junto
 * com o restante do cache de metadados no IndexedDB — não é enviada para
 * lugar nenhum.
 */

let editModalAnimeId = null;
let editModalPendingCoverDataUrl = null;

function openEditModal(animeId) {
  editModalAnimeId = animeId;
  editModalPendingCoverDataUrl = null;

  const meta = getMeta(animeId);
  document.getElementById('edit-title').value = meta.officialTitle || '';
  document.getElementById('edit-synopsis').value = meta.synopsis || '';
  document.getElementById('edit-cover-url').value = '';
  document.getElementById('edit-cover-file').value = '';
  document.getElementById('edit-cover-preview').src = meta.cover;

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editModalAnimeId = null;
  editModalPendingCoverDataUrl = null;
}

function initEditModal() {
  document.getElementById('btn-edit-close').addEventListener('click', closeEditModal);
  document.getElementById('btn-edit-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });

  // Preview ao colar uma URL de imagem
  document.getElementById('edit-cover-url').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      editModalPendingCoverDataUrl = null; // URL tem prioridade sobre arquivo local pendente
      document.getElementById('edit-cover-preview').src = url;
    }
  });

  // Preview + conversão para Data URL ao escolher um arquivo do computador
  document.getElementById('edit-cover-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editModalPendingCoverDataUrl = reader.result;
      document.getElementById('edit-cover-preview').src = reader.result;
      document.getElementById('edit-cover-url').value = ''; // arquivo local tem prioridade agora
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-edit-save').addEventListener('click', async () => {
    if (!editModalAnimeId) return;

    const title = document.getElementById('edit-title').value.trim();
    const synopsis = document.getElementById('edit-synopsis').value.trim();
    const urlValue = document.getElementById('edit-cover-url').value.trim();

    const overrides = {};
    if (title) overrides.officialTitle = title;
    if (synopsis) overrides.synopsis = synopsis;
    if (editModalPendingCoverDataUrl) overrides.cover = editModalPendingCoverDataUrl;
    else if (urlValue) overrides.cover = urlValue;

    const updated = await saveManualOverride(editModalAnimeId, overrides);
    AppState.metadataById[editModalAnimeId] = updated;

    closeEditModal();
    showToast('Informações atualizadas.');
    renderAnimeDetail(editModalAnimeId);
  });
}
