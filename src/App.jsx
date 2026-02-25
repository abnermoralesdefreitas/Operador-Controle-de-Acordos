import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

/** ===================== Utils ===================== */
function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}
function excelToDate(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }

  const s = String(value || '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const d2 = new Date(s);
  if (!isNaN(d2)) return d2;

  return null;
}
function sameDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function formatBR(d) {
  return d ? d.toLocaleDateString('pt-BR') : '';
}
function toBRL(v) {
  if (typeof v === 'number')
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const s = String(v ?? '').trim();
  if (!s) return '';

  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(n))
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return s;
}
function parseBRLToNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : v;
}
function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
function uid() {
  return `id:${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function dateInputToISO(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  return isNaN(dt) ? '' : dt.toISOString();
}
function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function keyForClientLike(r) {
  const cpf = onlyDigits(r?.CPF);
  if (cpf && cpf.length >= 8) return `cpf:${cpf}`;
  const tel = onlyDigits(r?.Telefone);
  if (tel && tel.length >= 10) return `tel:${tel}`;
  return '';
}

/** ===================== Excel helpers ===================== */
function findHeaderRow(aoa) {
  const maxScan = Math.min(25, aoa.length);

  const looksCpf = (cell) => {
    const t = norm(cell);
    return (
      t === 'cpf' ||
      t.includes('cpf') ||
      t.includes('cpf cnpj') ||
      t.includes('cpf/cnpj') ||
      t.includes('documento')
    );
  };

  const looksNome = (cell) => {
    const t = norm(cell);
    return t === 'nome' || t.includes('nome') || t.includes('cliente');
  };

  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i] || [];
    let cpfOk = false;
    let nomeOk = false;

    for (const cell of row) {
      if (!cpfOk && looksCpf(cell)) cpfOk = true;
      if (!nomeOk && looksNome(cell)) nomeOk = true;
    }
    if (cpfOk && nomeOk) return i;
  }

  for (let i = 0; i < maxScan; i++) {
    const filled = (aoa[i] || []).filter(
      (c) => String(c ?? '').trim() !== ''
    ).length;
    if (filled >= 3) return i;
  }

  return 0;
}

function mapRow(rawObj) {
  const keys = Object.keys(rawObj);

  const getBy = (predicate) => {
    for (const k of keys) {
      const nk = norm(k);
      if (predicate(nk)) return rawObj[k];
    }
    return '';
  };

  const cpf = getBy(
    (k) =>
      k === 'cpf' ||
      k.includes('cpf') ||
      k.includes('cpf cnpj') ||
      k.includes('cpf/cnpj') ||
      k.includes('documento')
  );

  const nome = getBy(
    (k) => k === 'nome' || k.includes('nome') || k.includes('cliente')
  );

  const valor = getBy(
    (k) =>
      k === 'valor' ||
      k.includes('valor') ||
      k.includes('vlr') ||
      k.includes('parcela') ||
      k.includes('acordo')
  );

  const vencRaw = getBy(
    (k) =>
      k === 'data' ||
      k.includes('venc') ||
      k.includes('vencimento') ||
      k.includes('data venc') ||
      k.includes('dt venc') ||
      k.includes('vcto')
  );

  const telefone = getBy(
    (k) =>
      k.includes('tel') ||
      k.includes('fone') ||
      k.includes('cel') ||
      k.includes('contato') ||
      k.includes('whats')
  );

  const tipoNegociacao = getBy(
    (k) =>
      k.includes('tipo') ||
      k.includes('negoci') ||
      k.includes('tipo de negoci') ||
      k.includes('modalidade')
  );

  const status = getBy(
    (k) =>
      k === 'status' ||
      k.includes('status') ||
      k.includes('situacao') ||
      k.includes('sit') ||
      k.includes('pag')
  );

  const obs = getBy(
    (k) =>
      k.includes('obs') ||
      k.includes('observacao') ||
      k.includes('observação') ||
      k.includes('coment') ||
      k.includes('anot')
  );

  const vencDate = excelToDate(vencRaw);

  return {
    CPF: String(cpf ?? '').trim(),
    Nome: String(nome ?? '').trim(),
    Valor: valor,
    VencimentoISO: vencDate ? vencDate.toISOString() : '',
    Telefone: String(telefone ?? '').trim(),
    TipoNegociacao: String(tipoNegociacao ?? '').trim(),
    Status: String(status ?? '').trim(),
    Obs: String(obs ?? '').trim(),
  };
}

/** ===================== Export helpers ===================== */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function downloadCSV(rows, filename) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const esc = (val) => {
    const s = String(val ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n'))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ].join('\n');

  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function downloadXLSX(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  const array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    filename,
    new Blob([array], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
}

/** ===================== Whats ===================== */
function buildWhatsLinkBR(telefoneComDDD, message) {
  const d = onlyDigits(telefoneComDDD);
  const e164 = d.startsWith('55') ? d : `55${d}`;
  if (e164.length < 12) return '';
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

/** ===================== Storage Keys ===================== */
const LS_MANUAL_CLIENTS = 'operador_clientes_manuais_v4';
const LS_PROMISES = 'operador_promessas_v4';

/** ===================== Time ===================== */
const MS_DAY = 24 * 60 * 60 * 1000;

/** ===================== Modal ===================== */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div className="modalTitle">{title}</div>
          <button className="btn btnMini" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

/** ===================== App ===================== */
export default function App() {
  /** ===== Toast ===== */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);
  function toast(msg) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1700);
  }

  /** ===== Base ===== */
  const [page, setPage] = useState('dashboard'); // dashboard | clientes | promessas
  const [rows, setRows] = useState([]);

  /** Excel import */
  const [wb, setWb] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fileLabel, setFileLabel] = useState('');

  /** Filters (clientes) */
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('TODOS'); // TODOS | VENCE_HOJE | ATRASADO | PAGO | PENDENTE

  /** Actions menu */
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  /** Modals */
  const [openNewClient, setOpenNewClient] = useState(false);
  const [openPromiseModal, setOpenPromiseModal] = useState(false);

  /** Promessa modal data (from a client) */
  const [promiseDraft, setPromiseDraft] = useState({
    key: '',
    Nome: '',
    Telefone: '',
    CPF: '',
    Valor: '',
    promiseDate: '',
    note: '',
  });

  /** ===== Persistência ===== */
  const [manualClients, setManualClients] = useState(() => {
    const raw = localStorage.getItem(LS_MANUAL_CLIENTS);
    return safeParse(raw, []);
  });

  const [promises, setPromises] = useState(() => {
    const raw = localStorage.getItem(LS_PROMISES);
    return safeParse(raw, {});
  });

  useEffect(() => {
    localStorage.setItem(LS_MANUAL_CLIENTS, JSON.stringify(manualClients));
  }, [manualClients]);

  useEffect(() => {
    localStorage.setItem(LS_PROMISES, JSON.stringify(promises));
  }, [promises]);

  /** close menu on outside click */
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  /** ===== Datas ===== */
  const today = useMemo(() => new Date(), []);
  const baseHoje = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  );

  /** ===== Helpers negócio ===== */
  function vencDate(r) {
    return r?.VencimentoISO ? new Date(r.VencimentoISO) : null;
  }
  function isPago(r) {
    return norm(r?.Status).includes('pago');
  }
  function venceHoje(r) {
    const d = vencDate(r);
    return d ? sameDay(d, today) && !isPago(r) : false;
  }
  function atrasado(r) {
    const d = vencDate(r);
    return d ? d < baseHoje && !isPago(r) : false;
  }
  function daysLate(r) {
    const d = vencDate(r);
    if (!d) return 0;
    const baseVenc = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = baseHoje.getTime() - baseVenc.getTime();
    return Math.floor(diff / MS_DAY);
  }
  function msgHoje(r) {
    const d = vencDate(r);
    const data = d ? formatBR(d) : 'hoje';
    const valor = toBRL(r.Valor);
    return `Olá, ${r.Nome}. Passando para confirmar o pagamento do acordo com vencimento ${data}. Valor: ${valor}. Assim que efetuar, me envie o comprovante para anexarmos.`;
  }
  function badgeForVenc(r) {
    const pago = isPago(r);
    const hoje_ = venceHoje(r);
    const atr = atrasado(r);
    if (pago) return 'pill pillGood';
    if (atr) return 'pill pillBad';
    if (hoje_) return 'pill pillWarn';
    return 'pill';
  }

  /** ===== Promessas ===== */
  function upsertPromiseByKey(key, payloadOrNull) {
    setPromises((prev) => {
      const next = { ...(prev || {}) };
      if (!payloadOrNull) {
        delete next[key];
        return next;
      }
      next[key] = payloadOrNull;
      return next;
    });
  }

  function mergePromisesIntoRows(inRows) {
    return (inRows || []).map((r) => {
      const k = keyForClientLike(r);
      const p = k ? promises?.[k] : null;
      if (!p?.promiseISO) return r;
      return { ...r, PromessaISO: p.promiseISO };
    });
  }

  /** manual -> rows */
  const manualRows = useMemo(() => {
    return (manualClients || []).map((c) => ({
      _id: c._id,
      CPF: c.CPF || '',
      Nome: c.Nome || '',
      Valor: c.Valor ?? '',
      VencimentoISO: c.VencimentoISO || '',
      Telefone: c.Telefone || '',
      TipoNegociacao: c.TipoNegociacao || '',
      Status: c.Status || '',
      Obs: c.Obs || '',
      PromessaISO: c.PromessaISO || '',
      _source: 'manual',
      createdAt: c.createdAt || '',
    }));
  }, [manualClients]);

  function composeRows(importedRows) {
    const imp = (importedRows || []).map((r) => ({ ...r, _source: 'excel' }));
    return mergePromisesIntoRows([...manualRows, ...imp]);
  }

  /** init rows */
  useEffect(() => {
    setRows((prev) => {
      if (prev && prev.length) return prev;
      return mergePromisesIntoRows([...manualRows]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ===== Excel Import ===== */
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLabel(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        setWb(workbook);
        setSheetNames(workbook.SheetNames || []);
        const first = workbook.SheetNames?.[0] || '';
        setSelectedSheet(first);

        setRows(mergePromisesIntoRows([...manualRows]));
        setQ('');
        setFilter('TODOS');
        setMenuOpenId(null);
        setPage('dashboard');

        toast('Arquivo importado ✅ selecione a aba e clique Carregar');
      } catch (err) {
        console.error(err);
        alert('Erro ao ler o arquivo. Veja o Console (F12).');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function loadSelectedSheet() {
    if (!wb || !selectedSheet) {
      alert('Selecione uma aba primeiro.');
      return;
    }
    try {
      const ws = wb.Sheets[selectedSheet];
      if (!ws) {
        alert('Aba não encontrada no arquivo.');
        return;
      }

      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const headerRow = findHeaderRow(aoa);
      const json = XLSX.utils.sheet_to_json(ws, {
        defval: '',
        range: headerRow,
      });

      const mapped = json
        .map(mapRow)
        .filter((r) => r.CPF || r.Nome || r.Telefone);

      const withId = mapped.map((r, i) => ({ _id: String(i + 1), ...r }));

      setRows(composeRows(withId));
      setQ('');
      setFilter('TODOS');
      setMenuOpenId(null);

      toast('Aba carregada ✅');
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar a aba. Veja o Console (F12).');
    }
  }

  /** ===== Cadastro manual (Modal) ===== */
  const [cForm, setCForm] = useState({
    CPF: '',
    Nome: '',
    Telefone: '',
    Valor: '',
    VencDate: '',
  });

  function saveManualClient() {
    const CPF = String(cForm.CPF || '').trim();
    const Nome = String(cForm.Nome || '').trim();
    const Telefone = String(cForm.Telefone || '').trim();
    const Valor = cForm.Valor;
    const vencISO = dateInputToISO(cForm.VencDate);

    if (!Nome || !Telefone)
      return alert('Preencha pelo menos Nome e Telefone.');
    if (!vencISO) return alert('Escolha o Vencimento.');

    const item = {
      _id: uid(),
      CPF,
      Nome,
      Telefone,
      Valor: parseBRLToNumber(Valor),
      VencimentoISO: vencISO,
      TipoNegociacao: '',
      Status: '',
      Obs: '',
      PromessaISO: '',
      createdAt: new Date().toISOString(),
    };

    setManualClients((prev) => [item, ...(prev || [])]);
    setRows((prev) =>
      mergePromisesIntoRows([{ ...item, _source: 'manual' }, ...(prev || [])])
    );
    setCForm({ CPF: '', Nome: '', Telefone: '', Valor: '', VencDate: '' });

    setOpenNewClient(false);
    toast('Cliente salvo ✅');
  }

  function deleteAllManualClients() {
    if (!confirm('Apagar TODOS os clientes manuais?')) return;
    setManualClients([]);
    setRows((prev) => (prev || []).filter((r) => r._source !== 'manual'));
    toast('Clientes manuais apagados.');
  }

  /** ===== Clientes: computed ===== */
  const computed = useMemo(() => {
    const query = q.trim().toLowerCase();

    const byFilter = (r) => {
      if (filter === 'TODOS') return true;
      if (filter === 'PAGO') return isPago(r);
      if (filter === 'PENDENTE') return !isPago(r);
      if (filter === 'VENCE_HOJE') return venceHoje(r);
      if (filter === 'ATRASADO') return atrasado(r);
      return true;
    };

    const bySearch = (r) => {
      if (!query) return true;
      return (
        String(r.CPF).toLowerCase().includes(query) ||
        String(r.Nome).toLowerCase().includes(query) ||
        String(r.Telefone).toLowerCase().includes(query)
      );
    };

    const filtered = (rows || []).filter((r) => byFilter(r) && bySearch(r));

    const stats = {
      totalClientes: (rows || []).length,
      pendentes: (rows || []).filter((r) => !isPago(r)).length,
      pagos: (rows || []).filter(isPago).length,
      venceHoje: (rows || []).filter(venceHoje).length,
      atrasados: (rows || []).filter(atrasado).length,
      manuais: (rows || []).filter((r) => r._source === 'manual').length,
    };

    return { filtered, stats };
  }, [rows, q, filter, today, baseHoje]);

  /** ===== Bulk copy ===== */
  function bulkPhones(list) {
    const phones = (list || [])
      .map((r) => onlyDigits(r.Telefone))
      .filter((d) => d && d.length >= 10)
      .map((d) => (d.startsWith('55') ? d : `55${d}`));
    return phones.join('\n');
  }

  async function copiar(txt, ok = 'Copiado ✅') {
    try {
      await navigator.clipboard.writeText(txt);
      toast(ok);
    } catch {
      prompt('Copie o texto abaixo:', txt);
    }
  }

  function copyBulkFromCurrentView(kind) {
    if (!computed.filtered.length) return toast('Sem números nessa visão.');

    if (kind === 'HOJE') {
      const list = computed.filtered.filter((r) => venceHoje(r) && !isPago(r));
      if (!list.length) return toast('Sem clientes vencendo hoje.');
      return copiar(bulkPhones(list), `Copiado (${list.length}) ✅`);
    }
    if (kind === 'QUEBRAS') {
      const list = computed.filtered.filter(
        (r) => atrasado(r) && daysLate(r) > 5 && !isPago(r)
      );
      if (!list.length) return toast('Sem quebras (+5 dias) nessa visão.');
      return copiar(bulkPhones(list), `Copiado quebras (${list.length}) ✅`);
    }
    if (kind === 'ATRASADO_1_5') {
      const list = computed.filtered.filter(
        (r) => atrasado(r) && daysLate(r) >= 1 && daysLate(r) <= 5 && !isPago(r)
      );
      if (!list.length) return toast('Sem atrasos 1–5 dias nessa visão.');
      return copiar(bulkPhones(list), `Copiado atrasados (${list.length}) ✅`);
    }
  }

  /** ===== Exports ===== */
  function exportar(tipo) {
    if (!rows.length) return;

    const out = rows.map((r) => {
      const d = vencDate(r);
      return {
        CPF: r.CPF,
        Nome: r.Nome,
        Valor: r.Valor,
        Vencimento: d ? formatBR(d) : '',
        Telefone: r.Telefone,
        'Tipo de negociação': r.TipoNegociacao,
        Status: r.Status,
        Obs: r.Obs,
        Promessa: r.PromessaISO ? formatBR(new Date(r.PromessaISO)) : '',
        Origem: r._source || '',
      };
    });

    if (tipo === 'csv') downloadCSV(out, 'clientes_atualizado.csv');
    if (tipo === 'xlsx') downloadXLSX(out, 'clientes_atualizado.xlsx');
    toast('Exportado ✅');
  }

  /** ===== Charts ===== */
  const chartStatusData = useMemo(() => {
    return {
      labels: ['Pendentes', 'Pagos', 'Vence hoje', 'Atrasados'],
      datasets: [
        {
          label: 'Clientes',
          data: [
            computed.stats.pendentes,
            computed.stats.pagos,
            computed.stats.venceHoje,
            computed.stats.atrasados,
          ],
          backgroundColor: [
            'rgba(255, 176, 0, 0.55)',
            'rgba(0, 255, 163, 0.45)',
            'rgba(0, 192, 255, 0.45)',
            'rgba(255, 74, 108, 0.45)',
          ],
          borderColor: [
            'rgba(255, 176, 0, 1)',
            'rgba(0, 255, 163, 1)',
            'rgba(0, 192, 255, 1)',
            'rgba(255, 74, 108, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [computed.stats]);

  const doughnutData = useMemo(() => {
    return {
      labels: ['Pendentes', 'Pagos'],
      datasets: [
        {
          data: [computed.stats.pendentes, computed.stats.pagos],
          backgroundColor: ['rgba(255,176,0,0.70)', 'rgba(0,255,163,0.55)'],
          borderColor: ['rgba(255,176,0,1)', 'rgba(0,255,163,1)'],
          borderWidth: 1,
        },
      ],
    };
  }, [computed.stats]);

  const vencimentos7d = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseHoje);
      d.setDate(d.getDate() + i);
      return d;
    });

    const counts = days.map((d) => {
      return rows.filter((r) => {
        const vd = vencDate(r);
        if (!vd) return false;
        return sameDay(vd, d) && !isPago(r);
      }).length;
    });

    return {
      labels: days.map((d) => formatBR(d)),
      datasets: [
        {
          label: 'Vencimentos (7 dias)',
          data: counts,
          fill: true,
          tension: 0.35,
          borderColor: 'rgba(170, 94, 255, 0.95)',
          backgroundColor: 'rgba(170, 94, 255, 0.18)',
          pointBackgroundColor: 'rgba(0, 255, 214, 0.95)',
          pointBorderColor: 'rgba(0, 255, 214, 0.95)',
          pointRadius: 3,
        },
      ],
    };
  }, [rows, baseHoje]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.90)' } },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.75)' },
          grid: { color: 'rgba(255,255,255,0.10)' },
        },
        y: {
          ticks: { color: 'rgba(255,255,255,0.75)' },
          grid: { color: 'rgba(255,255,255,0.10)' },
          beginAtZero: true,
        },
      },
    }),
    []
  );

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.90)' } },
      },
      cutout: '68%',
    }),
    []
  );

  /** ===== UI helpers ===== */
  function openWhats(telefone, msg) {
    const wa = buildWhatsLinkBR(telefone, msg);
    if (!wa) return alert('Telefone inválido para Whats.');
    window.open(wa, '_blank', 'noopener,noreferrer');
  }

  /** ===== Promessas: list + filters ===== */
  const [promiseView, setPromiseView] = useState('TODAS'); // TODAS | HOJE | VENCIDAS | PROX7

  const promiseList = useMemo(() => {
    const list = [];
    for (const [k, v] of Object.entries(promises || {})) {
      if (!v?.promiseISO) continue;
      list.push({
        key: k,
        promiseISO: v.promiseISO,
        updatedAt: v.updatedAt,
        note: v.note || '',
        snapshot: v.snapshot || {},
      });
    }
    list.sort((a, b) => new Date(a.promiseISO) - new Date(b.promiseISO));
    return list;
  }, [promises]);

  const promiseComputed = useMemo(() => {
    const base = promiseList;
    const counts = { total: base.length, hoje: 0, vencidas: 0, prox7: 0 };

    const filtered = base.filter((p) => {
      const d = new Date(p.promiseISO);
      if (isNaN(d)) return false;
      const baseP = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      const diffDays = Math.floor((baseP - baseHoje) / MS_DAY);
      const isHoje = sameDay(baseP, baseHoje);
      const isVencida = baseP < baseHoje;
      const isProx7 = diffDays >= 0 && diffDays <= 7;

      if (isHoje) counts.hoje += 1;
      if (isVencida) counts.vencidas += 1;
      if (isProx7) counts.prox7 += 1;

      if (promiseView === 'TODAS') return true;
      if (promiseView === 'HOJE') return isHoje;
      if (promiseView === 'VENCIDAS') return isVencida;
      if (promiseView === 'PROX7') return isProx7;
      return true;
    });

    return { filtered, counts };
  }, [promiseList, promiseView, baseHoje]);

  /** ===== Promessas: registrar manualmente (form na aba promessas) ===== */
  const [promiseForm, setPromiseForm] = useState({
    Nome: '',
    Telefone: '',
    CPF: '',
    Valor: '',
    promiseDate: '',
    note: '',
  });

  function savePromiseFromForm() {
    const Nome = String(promiseForm.Nome || '').trim();
    const Telefone = String(promiseForm.Telefone || '').trim();
    const CPF = String(promiseForm.CPF || '').trim();
    const Valor = promiseForm.Valor;
    const promiseISO = dateInputToISO(promiseForm.promiseDate);

    if (!Nome && !Telefone && !CPF)
      return alert('Preencha pelo menos Nome e Telefone (ou CPF).');
    if (!promiseISO) return alert('Selecione a data da promessa.');

    const key =
      (CPF && `cpf:${onlyDigits(CPF)}`) ||
      (Telefone && `tel:${onlyDigits(Telefone)}`) ||
      `custom:${uid()}`;

    const payload = {
      promiseISO,
      updatedAt: new Date().toISOString(),
      note: String(promiseForm.note || '').trim(),
      snapshot: {
        Nome,
        Telefone,
        CPF,
        Valor: parseBRLToNumber(Valor),
      },
    };

    upsertPromiseByKey(key, payload);

    // aplica em rows se bater cpf/tel
    setRows((prev) => mergePromisesIntoRows(prev));

    setPromiseForm({
      Nome: '',
      Telefone: '',
      CPF: '',
      Valor: '',
      promiseDate: '',
      note: '',
    });
    toast('Promessa registrada ✅');
  }

  /** ===== Promessa: abrir modal a partir de um cliente ===== */
  function openPromiseForClient(r) {
    const key = keyForClientLike(r) || `custom:${uid()}`;
    const existing = promises?.[key];

    setPromiseDraft({
      key,
      Nome: r?.Nome || existing?.snapshot?.Nome || '',
      Telefone: r?.Telefone || existing?.snapshot?.Telefone || '',
      CPF: r?.CPF || existing?.snapshot?.CPF || '',
      Valor: r?.Valor ?? existing?.snapshot?.Valor ?? '',
      promiseDate: existing?.promiseISO
        ? isoToDateInput(existing.promiseISO)
        : '',
      note: existing?.note || '',
    });
    setOpenPromiseModal(true);
  }

  function savePromiseDraft() {
    if (!promiseDraft.key) return;

    const promiseISO = dateInputToISO(promiseDraft.promiseDate);
    if (!promiseISO) return alert('Selecione a data da promessa.');

    const payload = {
      promiseISO,
      updatedAt: new Date().toISOString(),
      note: String(promiseDraft.note || '').trim(),
      snapshot: {
        Nome: String(promiseDraft.Nome || '').trim(),
        Telefone: String(promiseDraft.Telefone || '').trim(),
        CPF: String(promiseDraft.CPF || '').trim(),
        Valor: parseBRLToNumber(promiseDraft.Valor),
      },
    };

    upsertPromiseByKey(promiseDraft.key, payload);
    setRows((prev) => mergePromisesIntoRows(prev));
    setOpenPromiseModal(false);
    toast('Promessa salva ✅');
  }

  function removePromiseByKey(key) {
    if (!confirm('Remover esta promessa?')) return;
    upsertPromiseByKey(key, null);
    setRows((prev) => mergePromisesIntoRows(prev));
    toast('Promessa removida.');
  }

  /** ===================== Render ===================== */
  return (
    <div className="appShell themeDark">
      {toastMsg ? <div className="toast">{toastMsg}</div> : null}

      <aside className="sidebar">
        <div className="brand">
          <div className="brandDot" />
          <div>
            <div className="brandTitle">Operador</div>
            <div className="brandSub">Controle de acordos</div>
          </div>
        </div>

        <div className="sideGroup">
          <button
            className={`sideBtn ${page === 'dashboard' ? 'active' : ''}`}
            onClick={() => setPage('dashboard')}
          >
            <span>Dashboard</span>
          </button>

          <button
            className={`sideBtn ${page === 'clientes' ? 'active' : ''}`}
            onClick={() => setPage('clientes')}
          >
            <span>Clientes</span>
          </button>

          <button
            className={`sideBtn ${page === 'promessas' ? 'active' : ''}`}
            onClick={() => setPage('promessas')}
          >
            <span>Promessas</span>
            <span className="sideCount">{promiseComputed.counts.total}</span>
          </button>
        </div>

        <div className="sideDivider" />

        <div className="sideLabel">Importação</div>

        <label className="btn btnGhost full" style={{ textAlign: 'center' }}>
          Importar Excel
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </label>

        <div className="sideHint">
          {fileLabel ? `Arquivo: ${fileLabel}` : 'Nenhum arquivo importado'}
        </div>

        <div className="sideLabel" style={{ marginTop: 10 }}>
          Aba (sheet)
        </div>

        <select
          className="select full"
          value={selectedSheet}
          onChange={(e) => setSelectedSheet(e.target.value)}
          disabled={!sheetNames.length}
        >
          {sheetNames.length ? (
            sheetNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))
          ) : (
            <option value="">Importe um arquivo</option>
          )}
        </select>

        <button
          className="btn btnPrimary full"
          onClick={loadSelectedSheet}
          disabled={!wb || !selectedSheet}
          style={{ marginTop: 10 }}
        >
          Carregar aba
        </button>

        <div className="sideDivider" />

        <div className="sideLabel">Atalhos</div>
        <button
          className="btn full"
          onClick={() => exportar('csv')}
          disabled={!rows.length}
        >
          Exportar CSV
        </button>
        <button
          className="btn full"
          onClick={() => exportar('xlsx')}
          disabled={!rows.length}
          style={{ marginTop: 8 }}
        >
          Exportar XLSX
        </button>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="topTitle">
              {page === 'dashboard'
                ? 'Dashboard'
                : page === 'clientes'
                ? 'Clientes'
                : 'Promessas'}
            </div>
            <div className="topSub">
              {page !== 'promessas' ? (
                <>
                  Total: <b>{computed.stats.totalClientes}</b> • Pendentes:{' '}
                  <b>{computed.stats.pendentes}</b> • Vence hoje:{' '}
                  <b>{computed.stats.venceHoje}</b> • Atrasados:{' '}
                  <b>{computed.stats.atrasados}</b> • Manuais:{' '}
                  <b>{computed.stats.manuais}</b>
                </>
              ) : (
                <>
                  Total: <b>{promiseComputed.counts.total}</b> • Hoje:{' '}
                  <b>{promiseComputed.counts.hoje}</b> • Vencidas:{' '}
                  <b>{promiseComputed.counts.vencidas}</b> • Próx. 7 dias:{' '}
                  <b>{promiseComputed.counts.prox7}</b>
                </>
              )}
            </div>
          </div>

          <div className="topActions">
            {page === 'clientes' && (
              <button
                className="btn btnPrimary"
                onClick={() => setOpenNewClient(true)}
              >
                Novo cliente
              </button>
            )}
            {page === 'promessas' && (
              <button
                className="btn btnPrimary"
                onClick={() => setPromiseView('TODAS')}
              >
                Atualizar visão
              </button>
            )}
          </div>
        </div>

        {page === 'dashboard' ? (
          <div className="grid">
            <div className="kpis">
              <div className="kpiCard">
                <div className="kpiLabel">Total clientes</div>
                <div className="kpiValue">{computed.stats.totalClientes}</div>
              </div>
              <div className="kpiCard">
                <div className="kpiLabel">Pendentes</div>
                <div className="kpiValue">{computed.stats.pendentes}</div>
              </div>
              <div className="kpiCard">
                <div className="kpiLabel">Vence hoje</div>
                <div className="kpiValue">{computed.stats.venceHoje}</div>
              </div>
              <div className="kpiCard">
                <div className="kpiLabel">Atrasados</div>
                <div className="kpiValue">{computed.stats.atrasados}</div>
              </div>
              <div className="kpiCard">
                <div className="kpiLabel">Pagos</div>
                <div className="kpiValue">{computed.stats.pagos}</div>
              </div>
              <div className="kpiCard">
                <div className="kpiLabel">Manuais</div>
                <div className="kpiValue">{computed.stats.manuais}</div>
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">Distribuição</div>
              <div className="chartBox">
                <Bar data={chartStatusData} options={chartOptions} />
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">Pendentes x Pagos</div>
              <div className="chartBox">
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
            </div>

            <div className="panel panelWide">
              <div className="panelTitle">Vencimentos (próximos 7 dias)</div>
              <div className="chartBox">
                <Line data={vencimentos7d} options={chartOptions} />
              </div>
            </div>
          </div>
        ) : page === 'clientes' ? (
          <>
            <div className="filters">
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por CPF, nome ou telefone…"
              />

              <select
                className="select"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="TODOS">Todos</option>
                <option value="PENDENTE">Pendentes</option>
                <option value="VENCE_HOJE">Vence hoje</option>
                <option value="ATRASADO">Atrasados</option>
                <option value="PAGO">Pagos</option>
              </select>

              <button className="btn" onClick={() => setFilter('VENCE_HOJE')}>
                Vence hoje
              </button>
              <button className="btn" onClick={() => setFilter('ATRASADO')}>
                Atrasados
              </button>
              <button className="btn" onClick={() => setFilter('PAGO')}>
                Pagos
              </button>
              <button className="btn" onClick={() => setFilter('TODOS')}>
                Limpar
              </button>
            </div>

            {(filter === 'VENCE_HOJE' || filter === 'ATRASADO') && (
              <div
                className="panel"
                style={{
                  marginTop: 12,
                  padding: 12,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {filter === 'VENCE_HOJE' && (
                  <button
                    className="btn btnPrimary"
                    onClick={() => copyBulkFromCurrentView('HOJE')}
                  >
                    Copiar preventivo (hoje)
                  </button>
                )}
                {filter === 'ATRASADO' && (
                  <>
                    <button
                      className="btn btnPrimary"
                      onClick={() => copyBulkFromCurrentView('ATRASADO_1_5')}
                    >
                      Copiar preventivo atrasado (1–5 dias)
                    </button>
                    <button
                      className="btn btnDanger"
                      onClick={() => copyBulkFromCurrentView('QUEBRAS')}
                    >
                      Copiar quebras (+5 dias)
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="tableWrap">
              <div className="tableCard">
                <table>
                  <thead>
                    <tr>
                      <th>CPF</th>
                      <th>Nome</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Telefone</th>
                      <th className="thRight">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {computed.filtered.map((r) => {
                      const d = vencDate(r);
                      const waMsg = msgHoje(r);
                      const isOpen = menuOpenId === r._id;
                      const promKey = keyForClientLike(r);
                      const hasPromise = promKey
                        ? !!promises?.[promKey]?.promiseISO
                        : false;

                      return (
                        <tr key={`${r._source}:${r._id}`} className="rowHover">
                          <td className="mono">{r.CPF}</td>
                          <td className="tdStrong">
                            {r.Nome}
                            {r._source === 'manual' ? (
                              <span
                                style={{
                                  marginLeft: 8,
                                  opacity: 0.75,
                                  fontSize: 12,
                                }}
                              >
                                (manual)
                              </span>
                            ) : null}
                          </td>
                          <td>{toBRL(r.Valor)}</td>
                          <td>
                            <span className={badgeForVenc(r)}>
                              {formatBR(d)}
                              {venceHoje(r) && !isPago(r) ? ' • HOJE' : ''}
                              {atrasado(r)
                                ? ` • ATRASADO (${daysLate(r)}d)`
                                : ''}
                            </span>
                          </td>
                          <td className="mono">{r.Telefone}</td>

                          <td
                            className="tdRight"
                            style={{ position: 'relative' }}
                          >
                            <div
                              ref={isOpen ? menuRef : null}
                              style={{ display: 'inline-block' }}
                            >
                              <button
                                className="btn btnMini"
                                title="Ações"
                                onClick={() =>
                                  setMenuOpenId((prev) =>
                                    prev === r._id ? null : r._id
                                  )
                                }
                              >
                                ⋯
                              </button>

                              {isOpen && (
                                <div className="menuPop">
                                  <button
                                    className="menuItem menuWhats"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openWhats(r.Telefone, waMsg);
                                    }}
                                  >
                                    WhatsApp
                                  </button>

                                  <button
                                    className="menuItem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      copiar(waMsg, 'Mensagem copiada ✅');
                                    }}
                                  >
                                    Copiar msg
                                  </button>

                                  <button
                                    className="menuItem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openPromiseForClient(r);
                                    }}
                                  >
                                    {hasPromise
                                      ? 'Editar promessa'
                                      : 'Registrar promessa'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {computed.filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, opacity: 0.8 }}>
                          Sem clientes nessa visão. Importe o Excel ou cadastre
                          pelo botão “Novo cliente”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Modal
              open={openNewClient}
              title="Novo cliente (manual)"
              onClose={() => setOpenNewClient(false)}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <input
                  className="input mono"
                  placeholder="CPF (opcional)"
                  value={cForm.CPF}
                  onChange={(e) =>
                    setCForm((p) => ({ ...p, CPF: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Nome"
                  value={cForm.Nome}
                  onChange={(e) =>
                    setCForm((p) => ({ ...p, Nome: e.target.value }))
                  }
                />
                <input
                  className="input mono"
                  placeholder="Telefone c/ DDD"
                  value={cForm.Telefone}
                  onChange={(e) =>
                    setCForm((p) => ({ ...p, Telefone: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Valor (ex: 716,00)"
                  value={cForm.Valor}
                  onChange={(e) =>
                    setCForm((p) => ({ ...p, Valor: e.target.value }))
                  }
                />
                <input
                  className="input"
                  type="date"
                  value={cForm.VencDate}
                  onChange={(e) =>
                    setCForm((p) => ({ ...p, VencDate: e.target.value }))
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 12,
                }}
              >
                <button className="btn btnPrimary" onClick={saveManualClient}>
                  Salvar
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setCForm({
                      CPF: '',
                      Nome: '',
                      Telefone: '',
                      Valor: '',
                      VencDate: '',
                    })
                  }
                >
                  Limpar
                </button>
                <button
                  className="btn btnDanger"
                  onClick={deleteAllManualClients}
                >
                  Apagar manuais
                </button>
              </div>

              <div className="sideHint" style={{ marginTop: 10 }}>
                Clientes manuais ficam salvos no navegador (GitHub Pages é
                domínio fixo).
              </div>
            </Modal>

            <Modal
              open={openPromiseModal}
              title="Promessa de pagamento"
              onClose={() => setOpenPromiseModal(false)}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="Nome"
                  value={promiseDraft.Nome}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({ ...p, Nome: e.target.value }))
                  }
                />
                <input
                  className="input mono"
                  placeholder="Telefone c/ DDD"
                  value={promiseDraft.Telefone}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({ ...p, Telefone: e.target.value }))
                  }
                />
                <input
                  className="input mono"
                  placeholder="CPF (opcional)"
                  value={promiseDraft.CPF}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({ ...p, CPF: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Valor (opcional)"
                  value={promiseDraft.Valor}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({ ...p, Valor: e.target.value }))
                  }
                />
                <input
                  className="input"
                  type="date"
                  value={promiseDraft.promiseDate}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({
                      ...p,
                      promiseDate: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Observação (opcional)"
                  value={promiseDraft.note}
                  onChange={(e) =>
                    setPromiseDraft((p) => ({ ...p, note: e.target.value }))
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 12,
                }}
              >
                <button className="btn btnPrimary" onClick={savePromiseDraft}>
                  Salvar promessa
                </button>
                <button
                  className="btn"
                  onClick={() => setOpenPromiseModal(false)}
                >
                  Cancelar
                </button>
              </div>

              <div className="sideHint" style={{ marginTop: 10 }}>
                Dica: você pode registrar promessa direto no cliente (Ações →
                Registrar promessa).
              </div>
            </Modal>
          </>
        ) : (
          <>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panelTitle">Registrar promessa (manual)</div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="Nome"
                  value={promiseForm.Nome}
                  onChange={(e) =>
                    setPromiseForm((p) => ({ ...p, Nome: e.target.value }))
                  }
                />
                <input
                  className="input mono"
                  placeholder="Telefone c/ DDD"
                  value={promiseForm.Telefone}
                  onChange={(e) =>
                    setPromiseForm((p) => ({ ...p, Telefone: e.target.value }))
                  }
                />
                <input
                  className="input mono"
                  placeholder="CPF (opcional)"
                  value={promiseForm.CPF}
                  onChange={(e) =>
                    setPromiseForm((p) => ({ ...p, CPF: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Valor (opcional)"
                  value={promiseForm.Valor}
                  onChange={(e) =>
                    setPromiseForm((p) => ({ ...p, Valor: e.target.value }))
                  }
                />
                <input
                  className="input"
                  type="date"
                  value={promiseForm.promiseDate}
                  onChange={(e) =>
                    setPromiseForm((p) => ({
                      ...p,
                      promiseDate: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Observação (opcional)"
                  value={promiseForm.note}
                  onChange={(e) =>
                    setPromiseForm((p) => ({ ...p, note: e.target.value }))
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 12,
                }}
              >
                <button
                  className="btn btnPrimary"
                  onClick={savePromiseFromForm}
                >
                  Salvar promessa
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setPromiseForm({
                      Nome: '',
                      Telefone: '',
                      CPF: '',
                      Valor: '',
                      promiseDate: '',
                      note: '',
                    })
                  }
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panelTitle">Filtros</div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginTop: 10,
                }}
              >
                <select
                  className="select"
                  value={promiseView}
                  onChange={(e) => setPromiseView(e.target.value)}
                  style={{ width: 220, minWidth: 180 }}
                >
                  <option value="TODAS">Todas</option>
                  <option value="HOJE">Hoje</option>
                  <option value="VENCIDAS">Vencidas</option>
                  <option value="PROX7">Próx. 7 dias</option>
                </select>

                <button className="btn" onClick={() => setPromiseView('HOJE')}>
                  Hoje
                </button>
                <button
                  className="btn"
                  onClick={() => setPromiseView('VENCIDAS')}
                >
                  Vencidas
                </button>
                <button className="btn" onClick={() => setPromiseView('PROX7')}>
                  Próx. 7 dias
                </button>
                <button className="btn" onClick={() => setPromiseView('TODAS')}>
                  Limpar
                </button>
              </div>

              <div className="sideHint" style={{ marginTop: 10 }}>
                Total: <b>{promiseComputed.counts.total}</b> • Hoje:{' '}
                <b>{promiseComputed.counts.hoje}</b> • Vencidas:{' '}
                <b>{promiseComputed.counts.vencidas}</b> • Próx. 7 dias:{' '}
                <b>{promiseComputed.counts.prox7}</b>
              </div>
            </div>

            <div className="tableWrap">
              <div className="tableCard">
                <table>
                  <thead>
                    <tr>
                      <th>Promessa</th>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>Valor</th>
                      <th className="thRight">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {promiseComputed.filtered.map((p) => {
                      const d = new Date(p.promiseISO);
                      const baseP = new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate()
                      );
                      const vencida = baseP < baseHoje;
                      const hoje_ = sameDay(baseP, baseHoje);

                      const badgeClass = hoje_
                        ? 'pill pillWarn'
                        : vencida
                        ? 'pill pillBad'
                        : 'pill pillGood';

                      const tel = p.snapshot?.Telefone || '';
                      const nome = p.snapshot?.Nome || '-';
                      const valor = p.snapshot?.Valor ?? '';
                      const note = p.note || '';

                      const msg = `Olá, ${nome}. Passando para confirmar a promessa de pagamento prevista para ${formatBR(
                        d
                      )}. Valor: ${toBRL(valor)}. ${
                        note ? `Obs: ${note}. ` : ''
                      }Se já pagou, me envie o comprovante, por favor.`;

                      return (
                        <tr key={p.key} className="rowHover">
                          <td>
                            <span className={badgeClass}>{formatBR(d)}</span>
                          </td>
                          <td className="tdStrong">{nome}</td>
                          <td className="mono">{tel || '-'}</td>
                          <td>{toBRL(valor)}</td>
                          <td className="tdRight">
                            <button
                              className="btn btnMini"
                              onClick={() => copiar(msg, 'Mensagem copiada ✅')}
                            >
                              Copiar
                            </button>
                            <button
                              className="btn btnMini btnPrimary"
                              style={{ marginLeft: 8 }}
                              onClick={() => openWhats(tel, msg)}
                              disabled={!onlyDigits(tel)}
                            >
                              Whats
                            </button>
                            <button
                              className="btn btnMini btnDanger"
                              style={{ marginLeft: 8 }}
                              onClick={() => removePromiseByKey(p.key)}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {promiseComputed.filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 16, opacity: 0.8 }}>
                          Nenhuma promessa nessa visão.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
