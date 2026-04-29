const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST,
  database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
  port: 5432,
});

app.get('/api/jogos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jogos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Rota para criar um novo usuário
app.post('/api/usuarios', async (req, res) => {
    const { nome, pin } = req.body;

    // Validação simples
    if (!nome || !pin) {
        return res.status(400).json({ error: "O nome e o PIN são obrigatórios!" });
    }

    try {
        const result = await pool.query(
          'INSERT INTO usuarios (nome, pin) VALUES ($1, $2) RETURNING *',
          [nome, pin]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao adicionar usuário no banco:", error);
        res.status(500).json({ error: "Erro interno ao criar usuário." });
    }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.nome,
        CAST(COALESCE(SUM(
          CASE
            -- Se o jogo ainda não aconteceu, 0 pontos
            WHEN j.gols_time_a_real IS NULL OR j.gols_time_b_real IS NULL THEN 0
            
            -- Acertou na mosca (3 pontos)
            WHEN p.gols_time_a = j.gols_time_a_real AND p.gols_time_b = j.gols_time_b_real THEN 3
            
            -- Acertou o vencedor ou empate usando a função SIGN (1 ponto)
            WHEN SIGN(p.gols_time_a - p.gols_time_b) = SIGN(j.gols_time_a_real - j.gols_time_b_real) THEN 1
            
            -- Errou tudo
            ELSE 0
          END
        ), 0) AS INTEGER) AS pontos
      FROM usuarios u
      LEFT JOIN palpites p ON u.id = p.usuario_id
      LEFT JOIN jogos j ON p.jogo_id = j.id
      GROUP BY u.id, u.nome
      ORDER BY pontos DESC, u.nome ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { 
    res.status(500).json({ erro: err.message }); 
  }
});

// Buscar palpites de um usuário específico
app.get('/api/palpites/:usuario_id', async (req, res) => {
    try {
        const { usuario_id } = req.params;
        const result = await pool.query('SELECT * FROM palpites WHERE usuario_id = $1', [usuario_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/palpites', async (req, res) => {
  // 1. Recebendo o 'pin' do front-end junto com os outros dados
  const { usuario_id, jogo_id, gols_time_a, gols_time_b, pin } = req.body;

  if (!pin) {
    return res.status(400).json({ erro: 'O PIN é obrigatório para salvar o palpite.' });
  }

  const golsA = (gols_time_a === "" || gols_time_a === undefined) ? 0 : Number(gols_time_a);
  const golsB = (gols_time_b === "" || gols_time_b === undefined) ? 0 : Number(gols_time_b);

  try {
    // 2. VERIFICAÇÃO DE SEGURANÇA 1: O PIN está correto?
    const userQuery = await pool.query('SELECT pin FROM usuarios WHERE id = $1', [usuario_id]);
    
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const usuario = userQuery.rows[0];
    if (usuario.pin !== pin) {
      // Retorna status 401 (Unauthorized) se o PIN não bater
      return res.status(401).json({ erro: 'PIN incorreto! Você não pode alterar os palpites desta pessoa.' });
    }

    // 3. VERIFICAÇÃO DE SEGURANÇA 2: O jogo já acabou?
    const checkQuery = await pool.query('SELECT gols_time_a_real FROM jogos WHERE id = $1', [jogo_id]);
    
    // Se o gols_time_a_real não for nulo, significa que o admin já inseriu o resultado!
    if (checkQuery.rows.length > 0 && checkQuery.rows[0].gols_time_a_real !== null) {
      return res.status(403).json({ erro: 'Este jogo já foi encerrado e os palpites estão bloqueados.' });
    }

    // 4. Se o PIN tá certo e o jogo não acabou, salva o palpite normalmente
    const query = `
      INSERT INTO palpites (usuario_id, jogo_id, gols_time_a, gols_time_b)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (usuario_id, jogo_id) 
      DO UPDATE SET gols_time_a = EXCLUDED.gols_time_a, gols_time_b = EXCLUDED.gols_time_b;
    `;
    await pool.query(query, [usuario_id, jogo_id, golsA, golsB]);
    
    res.json({ mensagem: 'Palpite salvo com sucesso!' });
  } catch (err) { 
    console.error("Erro ao salvar palpite:", err);
    res.status(500).json({ erro: 'Erro interno no servidor.' }); 
  }
});

// Rota do Admin: Salva o resultado REAL da partida
app.put('/api/jogos/:id/resultado', async (req, res) => {
    const jogoId = req.params.id;
    const { gols_time_a_real, gols_time_b_real } = req.body;

    if (gols_time_a_real === undefined || gols_time_b_real === undefined) {
        return res.status(400).json({ error: "Placar real incompleto." });
    }

    try {
        await pool.query(
          'UPDATE jogos SET gols_time_a_real = $1, gols_time_b_real = $2 WHERE id = $3',
          [gols_time_a_real, gols_time_b_real, jogoId]
        );
        res.json({ message: "Resultado oficial atualizado" });
    } catch (error) {
        console.error("Erro ao atualizar resultado do jogo:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

app.listen(3000, () => console.log('Backend Online'));