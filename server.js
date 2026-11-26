const express = require('express');
const fs = require('fs');
const path = require('path');
// API Key などの環境変数は .env.local から読み込む
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== 設定 =====
// 利用するLLMプロバイダを選択します（'openai' または 'gemini'）
const PROVIDER = 'openai';

// プロバイダごとに利用するモデル
const MODELS = {
    openai: 'gpt-6-luna',        // OpenAI（デフォルト）
    gemini: 'gemini-4-hydrogen', // Google Gemini
};
const MODEL = MODELS[PROVIDER];

let promptTemplate;
try {
    promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PLAN_RESPONSE_FORMAT = {
    type: 'json_schema',
    json_schema: {
        name: 'oshi_activity_plan',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                schedule: {
                    type: 'array',
                    minItems: 4,
                    maxItems: 7,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            time: { type: 'string' },
                            title: { type: 'string' },
                            detail: { type: 'string' },
                        },
                        required: ['time', 'title', 'detail'],
                    },
                },
                checklist: {
                    type: 'array',
                    minItems: 6,
                    maxItems: 10,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            item: { type: 'string' },
                            reason: { type: 'string' },
                        },
                        required: ['item', 'reason'],
                    },
                },
                budget: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 6,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            category: { type: 'string' },
                            amount: { type: 'integer', minimum: 0 },
                            note: { type: 'string' },
                        },
                        required: ['category', 'amount', 'note'],
                    },
                },
                advice: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
            },
            required: ['schedule', 'checklist', 'budget', 'advice'],
        },
    },
};

app.post('/api/', async (req, res) => {
    try {
        // title と、prompt.md の変数置換に使う値を受け取る
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { title = 'Generated Content', ...variables } = body;

        const requiredTextFields = [
            'oshiName', 'eventName', 'venue', 'eventDate', 'startTime',
            'favoriteColor',
        ];
        if (requiredTextFields.some(key => typeof variables[key] !== 'string' || !variables[key].trim())) {
            return res.status(400).json({ error: 'すべてのイベント情報を入力してください。' });
        }

        const budget = Number(variables.budget);
        if (!Number.isFinite(budget) || budget < 1 || budget > 10000000) {
            return res.status(400).json({ error: '予算は1円以上、1,000万円以下で入力してください。' });
        }
        variables.budget = budget;

        // prompt.md のテンプレート変数 ${key} をリクエストの値で置換する
        const finalPrompt = fillTemplate(promptTemplate, variables);

        let result;
        if (PROVIDER === 'openai') {
            result = await callOpenAI(finalPrompt);
        } else if (PROVIDER === 'gemini') {
            result = await callGemini(finalPrompt);
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        res.json({
            title: title,
            data: result,
        });

    } catch (error) {
        // 詳細はサーバーログにのみ出力し、クライアントには汎用メッセージを返す
        console.error('API Error:', error);
        res.status(500).json({ error: 'プランの作成に失敗しました。API設定や通信状況を確認して、もう一度お試しください。' });
    }
});

// prompt.md 内の ${key} を variables の対応する値で置換する
function fillTemplate(template, variables) {
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
        return Object.prototype.hasOwnProperty.call(variables, key)
            ? String(variables[key])
            : match; // 対応する値がなければそのまま残す
    });
}

async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const response = await fetch(OPENAI_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: prompt }
            ],
            reasoning_effort: 'low',
            max_completion_tokens: 3000,
            response_format: PLAN_RESPONSE_FORMAT
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    return parseJsonObject(responseText);
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                // 思考型モデルでは思考トークンもこの上限に含まれるため、余裕を持たせる
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                // プラン生成に深い思考は不要。HIGH（既定）だと思考で上限に達し JSON が途中で切れることがある
                thinkingConfig: { thinkingLevel: "LOW" }
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    return parseJsonObject(responseText);
}

// LLM が返した JSON オブジェクトをパースする
function parseJsonObject(responseText) {
    let parsedData;
    try {
        parsedData = JSON.parse(responseText);
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + parseError.message);
    }

    if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
        throw new Error('LLM response must be a JSON object.');
    }
    return parsedData;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Config: ${PROVIDER} - ${MODEL}`);
});
