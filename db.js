// ============================================================
// db.js - Firebase Firestore Database Layer
// Sara Her Makeup - Sistema de Gestão
// ============================================================

// Configuração Firebase - será preenchida pelo usuário
const FIREBASE_CONFIG = {
  apiKey: window.FIREBASE_API_KEY || "SUA_API_KEY",
  authDomain: window.FIREBASE_AUTH_DOMAIN || "SEU_PROJECT.firebaseapp.com",
  projectId: window.FIREBASE_PROJECT_ID || "SEU_PROJECT_ID",
  storageBucket: window.FIREBASE_STORAGE_BUCKET || "SEU_PROJECT.appspot.com",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "SEU_SENDER_ID",
  appId: window.FIREBASE_APP_ID || "SEU_APP_ID"
};

// Inicializar Firebase
let db, auth, app;

function initFirebase(config) {
  try {
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK não carregado');
      return false;
    }
    if (!firebase.apps.length) {
      app = firebase.initializeApp(config || FIREBASE_CONFIG);
    } else {
      app = firebase.apps[0];
    }
    db = firebase.firestore();
    auth = firebase.auth();
    return true;
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e);
    return false;
  }
}

// ============================================================
// CONFIG LOCAL (para guardar configurações do Firebase)
// ============================================================
const LocalConfig = {
  get() {
    return JSON.parse(localStorage.getItem('firebase_config') || 'null');
  },
  save(cfg) {
    localStorage.setItem('firebase_config', JSON.stringify(cfg));
  },
  clear() {
    localStorage.removeItem('firebase_config');
  }
};

// ============================================================
// BANCO DE DADOS - FIRESTORE
// ============================================================
const DB = {

  // ---- PRODUTOS ----
  async getProdutos() {
    try {
      const snap = await db.collection('produtos').orderBy('dataCadastro', 'desc').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); return []; }
  },

  async addProduto(produto) {
    try {
      produto.dataCadastro = firebase.firestore.FieldValue.serverTimestamp();
      produto.ativo = produto.ativo !== false;
      const ref = await db.collection('produtos').add(produto);
      return { id: ref.id, ...produto };
    } catch (e) { console.error(e); throw e; }
  },

  async updateProduto(id, dados) {
    try {
      await db.collection('produtos').doc(id).update(dados);
      return { id, ...dados };
    } catch (e) { console.error(e); throw e; }
  },

  async deleteProduto(id) {
    try {
      await db.collection('produtos').doc(id).delete();
    } catch (e) { console.error(e); throw e; }
  },

  async getProdutoById(id) {
    try {
      const doc = await db.collection('produtos').doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (e) { console.error(e); return null; }
  },

  // ---- PEDIDOS ----
  async getPedidos(filtroStatus) {
    try {
      let query = db.collection('pedidos').orderBy('data', 'desc');
      if (filtroStatus) query = query.where('status', '==', filtroStatus);
      const snap = await query.get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); return []; }
  },

  async addPedido(pedido) {
    try {
      pedido.data = firebase.firestore.FieldValue.serverTimestamp();
      pedido.status = pedido.status || 'pendente';
      const ref = await db.collection('pedidos').add(pedido);
      return { id: ref.id, ...pedido };
    } catch (e) { console.error(e); throw e; }
  },

  async updatePedido(id, dados) {
    try {
      await db.collection('pedidos').doc(id).update(dados);
    } catch (e) { console.error(e); throw e; }
  },

  // ---- CAIXA ----
  async getCaixa(inicio, fim) {
    try {
      let query = db.collection('caixa').orderBy('data', 'desc');
      if (inicio) query = query.where('data', '>=', new Date(inicio));
      if (fim) query = query.where('data', '<=', new Date(fim + 'T23:59:59'));
      const snap = await query.get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); return []; }
  },

  async addMovimentoCaixa(mov) {
    try {
      mov.data = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('caixa').add(mov);
      return { id: ref.id, ...mov };
    } catch (e) { console.error(e); throw e; }
  },

  // ---- CONFIGURAÇÕES DA LOJA ----
  async getConfig() {
    try {
      const doc = await db.collection('config').doc('loja').get();
      if (doc.exists) return doc.data();
      return this.getConfigDefault();
    } catch (e) {
      return this.getConfigDefault();
    }
  },

  getConfigDefault() {
    return {
      nomeLoja: 'Sara Her Makeup',
      whatsapp: '5527995030142',
      corPrimaria: '#e91e8c',
      corSecundaria: '#ff6bb5',
      logo: '',
      mensagemPedido: 'Olá Sara! Gostaria de fazer um pedido:'
    };
  },

  async saveConfig(config) {
    try {
      await db.collection('config').doc('loja').set(config, { merge: true });
    } catch (e) { console.error(e); throw e; }
  },

  // ---- RELATÓRIO FINANCEIRO ----
  async getResumoFinanceiro(inicio, fim) {
    try {
      const inicioDate = new Date(inicio);
      const fimDate = new Date(fim + 'T23:59:59');

      const [pedidosSnap, caixaSnap] = await Promise.all([
        db.collection('pedidos')
          .where('data', '>=', inicioDate)
          .where('data', '<=', fimDate)
          .get(),
        db.collection('caixa')
          .where('data', '>=', inicioDate)
          .where('data', '<=', fimDate)
          .get()
      ]);

      const pedidos = pedidosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const caixa = caixaSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const concluidos = pedidos.filter(p => p.status === 'concluido');
      const totalVendas = concluidos.reduce((s, p) => s + (p.total || 0), 0);
      const totalCusto = concluidos.reduce((s, p) => s + (p.totalCusto || 0), 0);
      const lucro = totalVendas - totalCusto;
      const margem = totalVendas > 0 ? (lucro / totalVendas) * 100 : 0;

      const entradas = caixa.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (m.valor || 0), 0);
      const saidas = caixa.filter(m => m.tipo === 'saida').reduce((s, m) => s + (m.valor || 0), 0);

      return { totalVendas, totalCusto, lucro, margem, entradas, saidas, saldo: entradas - saidas, pedidos, caixa };
    } catch (e) { console.error(e); return { totalVendas:0, totalCusto:0, lucro:0, margem:0, entradas:0, saidas:0, saldo:0, pedidos:[], caixa:[] }; }
  },

  // ---- DADOS DEMO ----
  async initDemoData() {
    try {
      const snap = await db.collection('produtos').limit(1).get();
      if (!snap.empty) return; // já tem dados

      const demos = [
        { nome: 'Batom Matte Vermelho', categoria: 'Batom', custo: 12.00, preco: 35.00, estoque: 20, estoqueMin: 5, descricao: 'Batom matte de longa duração, cor vermelho intenso', imagem: 'https://images.unsplash.com/photo-1586495777744-4e6232bf2f9b?w=400&q=80', ativo: true },
        { nome: 'Base Líquida FPS 30', categoria: 'Base', custo: 25.00, preco: 69.90, estoque: 15, estoqueMin: 3, descricao: 'Base líquida com proteção solar, cobertura média a alta', imagem: 'https://images.unsplash.com/photo-1631214524020-3c69b3b0e5e5?w=400&q=80', ativo: true },
        { nome: 'Paleta de Sombras 12 Cores', categoria: 'Sombra', custo: 18.00, preco: 55.00, estoque: 10, estoqueMin: 2, descricao: 'Paleta com 12 cores vibrantes, acabamento matte e shimmer', imagem: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=80', ativo: true },
        { nome: 'Máscara de Cílios Volume', categoria: 'Olhos', custo: 8.00, preco: 28.00, estoque: 25, estoqueMin: 5, descricao: 'Máscara de cílios para volume e alongamento', imagem: 'https://images.unsplash.com/photo-1583241800698-e8ab01830a22?w=400&q=80', ativo: true },
        { nome: 'Blush Rosé', categoria: 'Blush', custo: 10.00, preco: 32.00, estoque: 3, estoqueMin: 5, descricao: 'Blush em pó com cor rosé natural', imagem: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80', ativo: true },
        { nome: 'Iluminador Dourado', categoria: 'Iluminador', custo: 14.00, preco: 42.00, estoque: 8, estoqueMin: 3, descricao: 'Iluminador em pó com reflexo dourado', imagem: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&q=80', ativo: true },
      ];

      for (const p of demos) await this.addProduto(p);
      console.log('Dados demo inseridos!');
    } catch (e) { console.error('Erro ao inserir demo:', e); }
  }
};