import vm from 'vm';
import axios from "axios";

const batchRegex = /(?:```writeFile\s*([^\n]+)\s*([\s\S]*?)```|``javascript\s*([\s\S]*?)\s*``)/g;

export const getActions = (meta) => [
    [batchRegex, async (match, event) => {
        // Get the full message content
        const lastMessage = event.payload.messages[event.payload.messages.length - 1].content;

        // Find all blocks in order, preserving their position
        const blocks = Array.from(lastMessage.matchAll(batchRegex))
            .map(([full, filePath, fileContent, jsContent]) => {
                if (filePath && fileContent) {
                    return {
                        type: 'writeFile',
                        path: filePath.trim(),
                        content: fileContent.trim()
                    };
                } else {
                    return {
                        type: 'javascript',
                        content: jsContent.trim()
                    };
                }
            });

        if (blocks.length === 0) {
            return {
                error: "No valid blocks found",
                ...meta
            };
        }

        try {
            // Process blocks sequentially in order
            const results = [];
            for (const block of blocks) {
                if (block.type === 'writeFile') {
                    const url = '{{secrets.wpUrl}}';
                    const headers = { 'WP-API-KEY': '{{secrets.wpapiKey}}' };
                    const fsUrl = `${url}/wp-json/openkbs/v1/filesystem`;

                    const response = await axios.post(
                        `${fsUrl}/write`,
                        { path: block.path, content: block.content },
                        { headers }
                    );

                    results.push({
                        type: 'writeFile',
                        path: block.path,
                        success: response.status === 200
                    });
                } else if (block.type === 'javascript') {
                    const sourceCode = block.content
                        .replace(`\{\{secrets.wpapiKey\}\}`, '{{secrets.wpapiKey}}')
                        .replace(`\{\{secrets.wpUrl\}\}`, '{{secrets.wpUrl}}');

                    const script = new vm.Script(sourceCode);
                    const context = {
                        require: (id) => rootContext.require(id),
                        ...rootContext,
                        console,
                        module: { exports: {} }
                    };
                    vm.createContext(context);
                    script.runInContext(context);
                    const { handler } = context.module.exports;
                    const data = await handler();

                    results.push({
                        type: 'javascript',
                        success: true,
                        data
                    });
                }
            }

            const allSuccessful = results.every(r => r.success);

            if (allSuccessful) {
                return {
                    data: {
                        message: "All operations completed successfully",
                        results: results.map(r => ({
                            type: r.type,
                            ...(r.type === 'writeFile' ? { path: r.path } : { data: r.data })
                        }))
                    },
                    ...meta
                };
            } else {
                return {
                    data: {
                        error: "Some operations failed",
                        results
                    },
                    ...meta
                };
            }
        } catch (e) {
            return { error: e.response?.data || e.message, ...meta };
        }
    }],

    [/\/?googleSearch\("(.*)"\)/, async (match) => {
        const q = match[1];
        const meta = {_meta_actions: ["REQUEST_CHAT_MODEL"]} // enable GPT auto
        try {
            const noSecrets = '{{secrets.googlesearch_api_key}}'.includes('secrets.googlesearch_api_key');
            const params = { q, ...(noSecrets ? {} : { key: '{{secrets.googlesearch_api_key}}', cx: '{{secrets.googlesearch_engine_id}}' }) };
            const response = noSecrets
                ? await openkbs.googleSearch(params.q, params)
                : (await axios.get('https://www.googleapis.com/customsearch/v1', { params }))?.data?.items;
            const data = response?.map(({ title, link, snippet, pagemap }) => ({
                title, link, snippet, image: pagemap?.metatags?.[0]?.["og:image"]
            }));

            if(!data?.length) return { data: { error: "No results found" }, ...meta };
            return { data, ...meta };
        } catch (e) {
            return { error: e.response.data, ...meta };
        }
    }],

    [/\/?webpageToText\("(.*)"\)/, async (match) => {
        try {
            let response = await openkbs.webpageToText(match[1]);

            // limit output length
            if (response?.content?.length > 5000) {
                response.content = response.content.substring(0, 5000);
            }
            if(!response?.url) return { data: { error: "Unable to read website" }, ...meta };
            return { data: response, ...meta };
        } catch (e) {
            return { error: e.response.data, ...meta };
        }
    }],

    [/\/?viewImage\("(.*)"\)/, async (match) => {
        const url = match[1];
        const meta = {_meta_actions: ["REQUEST_CHAT_MODEL"]}
        return {
            data: [
                { type: "text", text: "Image URL: " + url },
                { type: "image_url", image_url: { url } }
            ],
            ...meta
        };
    }],
];