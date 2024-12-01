import React, { useEffect, useState } from "react";
import { Button } from '@mui/material';

const style = document.createElement('style');
style.innerHTML = `
    .codeContainer, .codeContainer code {
        background-color: #0d0d0d !important;
        color: white !important;
        text-shadow: none !important;
        border-radius: 10px !important;
        font-size: 13px !important;
    }
    .codeContainer * {
        background-color: #0d0d0d !important;
    }
`;
document.head.appendChild(style);

const Header = ({ setRenderSettings }) => {
    useEffect(() => {
        setRenderSettings({
            disableCodeExecuteButton: true,
            inputLabelsQuickSend: true,
        });
    }, [setRenderSettings]);
};

const isMobile = window.openkbs.isMobile;

const ChatMessageRenderer = ({ content, CodeViewer, setInputValue, sendButtonRippleRef }) => {
    const [addedSuggestions, setAddedSuggestions] = useState([]);

    const handleSuggestionClick = (suggestion) => {
        setInputValue((prev) => prev + (prev ? '\n' : '') + suggestion);
        setAddedSuggestions((prev) => [...prev, suggestion]);
        setTimeout(() => sendButtonRippleRef?.current?.pulsate(), 100);
    };

    const output = [];
    let language = null;

    content.split('\n').forEach(line => {
        const codeStartMatch = /```(?<language>\w+)/g.exec(line);
        const suggestionMatch = /\/suggestion\("([^"]+)"\)/g.exec(line);
        if (!language && codeStartMatch) {
            language = codeStartMatch.groups.language;
            output.push({ language, code: '' });
        } else if (language && line.match(/```/)) {
            language = null;
        } else if (language) {
            output[output.length - 1].code += line + '\n';
        } else if (suggestionMatch) {
            const suggestion = suggestionMatch[1];
            if (!addedSuggestions.includes(suggestion)) {
                output.push({ suggestion });
            }
        } else {
            output.push(line);
        }
    });

    return output.map((o, i) => {
        if (typeof o === 'string') {
            return <p key={i} style={{ marginTop: '0px', marginBottom: '0px' }}>{o}</p>;
        } else if (o.suggestion) {
            return (
                <div key={`a${i}`}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => handleSuggestionClick(o.suggestion)}
                        style={{ margin: '5px', textTransform: 'none' }}
                    >
                        {o.suggestion}
                    </Button>
                </div>
            );
        } else {
            return (
                <div key={i}>
                    <CodeViewer
                        limitedWidth={isMobile}
                        language={o.language}
                        className="codeContainer"
                        source={o.code}
                    />
                </div>
            );
        }
    });
};

const onRenderChatMessage = async (params) => {
    const { content } = params.messages[params.msgIndex];
    const { CodeViewer, setInputValue, sendButtonRippleRef } = params;

    if (content.match(/```/) || content.match(/\/suggestion\("([^"]+)"\)/g)) {
        return (
            <ChatMessageRenderer
                content={content}
                CodeViewer={CodeViewer}
                setInputValue={setInputValue}
                sendButtonRippleRef={sendButtonRippleRef}
            />
        );
    }
};

const exports = { onRenderChatMessage, Header };
window.contentRender = exports;
export default exports;