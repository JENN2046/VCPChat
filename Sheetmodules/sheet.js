document.addEventListener('DOMContentLoaded', () => {
    const fakeGrid = document.getElementById('fakeGrid');
    const createWorkbookBtn = document.getElementById('createWorkbookBtn');
    const workbookList = document.getElementById('workbookList');

    for (let row = 0; row < 12; row += 1) {
        const rowEl = document.createElement('div');
        rowEl.style.display = 'grid';
        rowEl.style.gridTemplateColumns = '60px repeat(6, 120px)';
        rowEl.style.height = '40px';

        for (let col = 0; col < 7; col += 1) {
            const cell = document.createElement('div');
            cell.style.borderRight = '1px solid rgba(255,255,255,0.06)';
            cell.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
            cell.style.padding = '10px 12px';
            cell.style.color = col === 0 || row === 0 ? '#8b9aad' : '#e6edf3';

            if (row === 0 && col > 0) {
                cell.textContent = String.fromCharCode(64 + col);
            } else if (col === 0 && row > 0) {
                cell.textContent = String(row);
            } else if (row > 0 && col > 0 && row < 4) {
                cell.textContent = `${row * col}`;
            }

            rowEl.appendChild(cell);
        }

        fakeGrid.appendChild(rowEl);
    }

    createWorkbookBtn?.addEventListener('click', () => {
        const item = document.createElement('li');
        item.className = 'placeholder-item';
        item.textContent = `新建工作簿草稿 ${workbookList.children.length}`;

        if (workbookList.firstElementChild?.textContent === 'Workbook CRUD 待接入') {
            workbookList.innerHTML = '';
        }

        workbookList.prepend(item);
    });
});
