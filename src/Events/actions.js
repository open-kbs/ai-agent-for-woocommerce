import vm from 'vm';
import axios from "axios";

export const getActions = (meta) => [

    // execute any JS code
    [/``javascript\s*([\s\S]*?)\s*``/, async (match) => {
        const sourceCode = match[1]
            .replace(`\{\{secrets.wpapiKey\}\}`,'{{secrets.wpapiKey}}')
            .replace(`\{\{secrets.wpUrl\}\}`,'{{secrets.wpUrl}}')

        // Create a new script from the source code
        const script = new vm.Script(sourceCode);

        // Create a new context for the script to run in
        const context = {
            require: (id) => {
                // allow to "require" any available module
                return rootContext.require(id)
            },
            ...rootContext,
            console,
            module: { exports: {} }
        }
        vm.createContext(context);

        // Run the script in the context
        script.runInContext(context);

        // Extract the handler function from the context
        const { handler } = context.module.exports;

        // Execute the handler function and return the result
        const data = await handler();
        return { data, ...meta };
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

    [/```php\s*\/\/ ([^\n]+)\s*([\s\S]*?)```/g, async (match, event) => {
        // Get the full message content
        const lastMessage = event.payload.messages[event.payload.messages.length - 1].content;

        // Find all matches in the message
        const files = Array.from(lastMessage.matchAll(/```php\s*\/\/ ([^\n]+)\s*([\s\S]*?)```/g))
            .map(([_, path, content]) => ({
                path: path.trim(),
                content: content.trim()
            }));

        return {files}

        if (files.length === 0) {
            return {
                error: "No valid PHP files found",
                ...meta
            };
        }

        try {
            const url = '{{secrets.wpUrl}}';
            const headers = { 'WP-API-KEY': '{{secrets.wpapiKey}}' };
            const fsUrl = `${url}/wp-json/openkbs/v1/filesystem`;

            // Process all files in parallel
            const results = await Promise.all(
                files.map(file =>
                    axios.post(
                        `${fsUrl}/write`,
                        { path: file.path, content: file.content },
                        { headers }
                    )
                )
            );

            // Check if all operations were successful
            const allSuccessful = results.every(r => r.status === 200);

            if (allSuccessful) {
                return {
                    data: {
                        message: "All files created or updated successfully",
                        files: files.map(f => f.path)
                    },
                    ...meta
                };
            } else {
                return {
                    data: {
                        error: "Some files failed to create or update",
                        results: results.map((r, i) => ({
                            path: files[i].path,
                            success: r.status === 200
                        }))
                    },
                    ...meta
                };
            }
        } catch (e) {
            return { error: e.response?.data || e.message, ...meta };
        }
    }]

];