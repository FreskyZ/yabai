// TODO build time replace to import from "https://unpkg.com/@emotion/css@11.11.2/dist/emotion-css.esm.js"
// import { css } from '@emotion/css';

const response = await fetch('/pipilapilayu/apibutton/voices.json');
const responseContent = await response.json();
const voices = responseContent.voices;
console.log(voices);

const mainElement = document.querySelector('main');
for (const category of voices.map(v => v.category).filter((v, i, a) => a.indexOf(v) == i)) {
    const categoryElement = document.createElement('div');
    categoryElement.className = 'category-container';
    const titleElement = document.createElement('div');
    titleElement.innerText = category;
    titleElement.className = 'category-title';
    categoryElement.appendChild(titleElement);
    for (const voice of voices.filter(v => v.category == category)) {
        const voiceElement = document.createElement('button');
        voiceElement.className = 'voice-button';
        voiceElement.innerText = voice.name;
        voiceElement.onclick = () => {
            const audio = new Audio(`/pipilapilayu/apibutton/voices/${voice.path}`);
            audio.play();
        };
        categoryElement.appendChild(voiceElement);
    }
    mainElement.appendChild(categoryElement);
}
export {};
