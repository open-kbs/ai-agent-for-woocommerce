import React, { useEffect } from "react";

const Header = ({ setRenderSettings }) => {
    useEffect(() => {
        setRenderSettings({
            disableCodeExecuteButton: true,
            inputLabelsQuickSend: true,
        });
    }, [setRenderSettings]);
}

const exports = { Header };
window.contentRender = exports;
export default exports;