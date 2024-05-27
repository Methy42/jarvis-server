import * as path from 'path';
import * as shell from 'shelljs';

type CppCommandTypes = {
    filePath: string;
    modelPath?: string;
    gpuEnabled?: boolean;
    coremlEnabled?: boolean;
    options?: IFlagTypes;
}
export type IFlagTypes = {
    language?: string;
    prompt?: string;
    output_txt?: boolean;
    output_srt?: boolean;
    output_vtt?: boolean;
    max_len?: number;
}


export const createCppCommand = ({ filePath, modelPath, gpuEnabled, coremlEnabled, options = {} }: CppCommandTypes) => {

    // https://github.com/ggerganov/whisper.cpp#quick-start
    const getFlags = (flags: IFlagTypes): string => {
        let s = '';

        let finalLanguage = flags['language'];
        let finalPrompt = flags['prompt'] || '';
        if (flags['language'] === 'zh_CN') {
            finalLanguage = 'zh';
            finalPrompt += ' 简体中文';
        } else if (flags['language'] === 'zh_TW') {
            finalLanguage = 'zh';
        }
        if (finalLanguage) {
            s += ` -l ${finalLanguage}`;
        }

        if (finalPrompt) {
            s += ` --prompt "${finalPrompt}"`;
        }

        if (flags['output_txt']) s += ' -otxt';
        if (flags['output_srt']) s += ' -osrt';
        if (flags['output_vtt']) s += ' -ovtt';

        if (flags['max_len']) s += ` -ml ${flags['max_len']}`;

        return s;
    }

    const WHISPER_PARENT_DIR = path.join(__dirname, '../../whisper.cpp/');

    if (process.platform === 'win32') {
        if (gpuEnabled) {
            const WHISPER_CPP_PATH = path.join(WHISPER_PARENT_DIR, 'build-win32-x64-gpu/bin/Release/');
            shell.cd(WHISPER_CPP_PATH);
            console.log('WHISPER_CPP_PATH(GPU)', WHISPER_CPP_PATH);
            return `main.exe ${getFlags(options)} -m "${modelPath}" -f "${filePath}"`;
        } else {
            const WHISPER_CPP_PATH = path.join(WHISPER_PARENT_DIR, 'build-win32-x64/bin/Release/');
            shell.cd(WHISPER_CPP_PATH);
            console.log('WHISPER_CPP_PATH', WHISPER_CPP_PATH);
            return `main.exe ${getFlags(options)} -m "${modelPath}" -f "${filePath}"`;
        }
    } else {
        if (coremlEnabled) {
            const WHISPER_CPP_PATH = path.join(WHISPER_PARENT_DIR, `build-${process.platform}-${process.arch}-coreml/bin/`);
            shell.cd(WHISPER_CPP_PATH);
            console.log('WHISPER_CPP_PATH', WHISPER_CPP_PATH);
            return `DYLD_LIBRARY_PATH="${WHISPER_CPP_PATH}../" ./main ${getFlags(options)} -m "${modelPath}" -f "${filePath}"`;
        } else {
            const WHISPER_CPP_PATH = path.join(WHISPER_PARENT_DIR, `build-${process.platform}-${process.arch}/bin/`);
            shell.cd(WHISPER_CPP_PATH);
            console.log('WHISPER_CPP_PATH', WHISPER_CPP_PATH);
            return `DYLD_LIBRARY_PATH="${WHISPER_CPP_PATH}../" ./main ${getFlags(options)} -m "${modelPath}" -f "${filePath}"`;
        }
    }
}

export type ITranscriptItem = {
    start: string;
    end: string;
    content: string;
    id: string;
}

const LINE_REG = /^\[(\d\d:[0-5]\d:[0-5]\d.\d\d\d) \-\-> (\d\d:[0-5]\d:[0-5]\d.\d\d\d)\](.*)$/;
export function whisperOutputToArray(vtt: string): ITranscriptItem[] {
    const lines: string[] = vtt.trim().split('\n');

    let item: ITranscriptItem = {
        start: '',
        end: '',
        content: '',
        id: ''
    };
    const arr: ITranscriptItem[] = [];
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const result = LINE_REG.exec(line);
        if (result) {
            item.start = result[1];
            item.end = result[2];
            item.content = result[3].trim();
            item.id = String(arr.length);
            arr.push(item);
            // clear
            item = {
                start: '',
                end: '',
                content: '',
                id: ''
            };
        }
    }

    return arr;
}

// log(whisperOutputToArray(`[00:08:22.000 --> 00:08:25.580]   [ visãoale / Lin란한 반가 vagy / 같은 문제들과 관계힛 바구니 ]
// [00:08:25.580 --> 00:08:28.100]   [ 기존경상 /rod]
// [00:08:28.100 --> 00:08:31.180]   [ 예전! / Share! beads / 사 cult ]
// [00:08:31.180 --> 00:08:34.620]   [ cs ]
// [00:08:34.620 --> 00:08:38.360]   [ 부풍 ]
// [00:08:38.360 --> 00:08:42.560]   [ 팬 ]
// [00:08:42.560 --> 00:08:45.280]   [ 부품 1. 10회]
// [00:08:45.280 --> 00:08:49.240]   [ 7회 / 부품 3. 10회 / 비교]`));

export function arrayToVttWithoutHeader(arr: ITranscriptItem[]) {
    return arr.map(item => {
        const tsLine = `${item.start} --> ${item.end}`;
        return `${tsLine}\n${item.content}\n`;
    }).join('\n');
}

export function arrayToVtt(arr: ITranscriptItem[]) {
    return `WEBVTT\n\n${arrayToVttWithoutHeader(arr)}`;
}

export function arrayToSrt(arr: ITranscriptItem[]) {
    return arr.map((item, index) => {
        const tsLine = `${item.start} --> ${item.end}`.replace(/\./g, ',');
        return `${index + 1}\n${tsLine}\n${item.content}\n`;
    }).join('\n');
}

function vttTimeToLrcTime(timeStr: string) {
    const [highPart, milliPart] = timeStr.split(/[.]/);
    const newHS = milliPart.slice(0, 2);
    const [hh, mm, second] = highPart.split(':');
    const mmNum = (parseInt(hh, 10) * 60 + parseInt(mm, 10)) % 100;
    const newMM = mmNum < 10 ? `0${mmNum}` : `${mmNum}`;
    return `${newMM}:${second}.${newHS}`;
}
export function arrayToLrc(arr: ITranscriptItem[]) {
    return arr.map((item) => {
        const time = vttTimeToLrcTime(item.start);
        return `[${time}]${item.content.replace(/\n/g, ' ')}\n`;
    }).join('');
}

const TS_REG = /^(\d\d:[0-5]\d:[0-5]\d.\d\d\d) \-\-> (\d\d:[0-5]\d:[0-5]\d.\d\d\d)$/;
export function vttToArray(rawVtt: string): ITranscriptItem[] {
    if (typeof rawVtt !== 'string') {
        throw new Error('vttToArray invalid input');
    }
    const vtt = rawVtt.replace('WEBVTT\n\n', '').trim();
    const lines: string[] = vtt.split('\n');

    let item: ITranscriptItem = {
        start: '',
        end: '',
        content: '',
        id: ''
    };
    const arr: ITranscriptItem[] = [];

    function collect() {
        if (item.start && item.end && item.content) {
            item.content = item.content.trim(); // remove trailing '\n'
            item.id = String(arr.length);
            arr.push(item);
            // clear
            item = {
                start: '',
                end: '',
                content: '',
                id: ''
            };
        }
    }
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const result = TS_REG.exec(line);
        if (result) {
            collect();
            item.start = result[1];
            item.end = result[2];
        } else {
            item.content += line + '\n';
        }
    }
    collect();
    return arr;
}

export const LANGUAGES = {
    "en": "english",
    "zh_CN": "simplified chinese",
    "zh_TW": "traditional chinese",
    "ja": "japanese",
    "ko": "korean",
    "fr": "french",
    "es": "spanish",
    "ru": "russian",
    "ar": "arabic",
    "th": "thai",
    "de": "german",
    "pt": "portuguese",
    "it": "italian",
    "hi": "hindi",
    "id": "indonesian",

    "tr": "turkish",
    "vi": "vietnamese",
    "he": "hebrew",
    "el": "greek",
    "pl": "polish",
    "nl": "dutch",
    "hu": "hungarian",
    "no": "norwegian",
    "sv": "swedish",
    "fi": "finnish",
    "cs": "czech",
    "da": "danish",
    "lt": "lithuanian",
    "sk": "slovak",
    "ms": "malay",
    "ro": "romanian",
    "bg": "bulgarian",
    "hr": "croatian",
    "lo": "lao",
    "ur": "urdu",
    "ta": "tamil",

    // "uk": "ukrainian",
    // "ca": "catalan",
    // "la": "latin",
    // "mi": "maori",
    // "ml": "malayalam",
    // "cy": "welsh",
    // "te": "telugu",
    // "fa": "persian",
    // "lv": "latvian",
    // "bn": "bengali",
    // "sr": "serbian",
    // "az": "azerbaijani",
    // "sl": "slovenian",
    // "kn": "kannada",
    // "et": "estonian",
    // "mk": "macedonian",
    // "br": "breton",
    // "eu": "basque",
    // "is": "icelandic",
    // "hy": "armenian",
    // "ne": "nepali",
    // "mn": "mongolian",
    // "bs": "bosnian",
    // "kk": "kazakh",
    // "sq": "albanian",
    // "sw": "swahili",
    // "gl": "galician",
    // "mr": "marathi",
    // "pa": "punjabi",
    // "si": "sinhala",
    // "km": "khmer",
    // "sn": "shona",
    // "yo": "yoruba",
    // "so": "somali",
    // "af": "afrikaans",
    // "oc": "occitan",
    // "ka": "georgian",
    // "be": "belarusian",
    // "tg": "tajik",
    // "sd": "sindhi",
    // "gu": "gujarati",
    // "am": "amharic",
    // "yi": "yiddish",
    // "uz": "uzbek",
    // "fo": "faroese",
    // "ht": "haitian creole",
    // "ps": "pashto",
    // "tk": "turkmen",
    // "nn": "nynorsk",
    // "mt": "maltese",
    // "sa": "sanskrit",
    // "lb": "luxembourgish",
    // "my": "myanmar",
    // "bo": "tibetan",
    // "tl": "tagalog",
    // "mg": "malagasy",
    // "as": "assamese",
    // "tt": "tatar",
    // "haw": "hawaiian",
    // "ln": "lingala",
    // "ha": "hausa",
    // "ba": "bashkir",
    // "jw": "javanese",
    // "su": "sundanese",
} as const;

export type LANGS = {
    -readonly [k in keyof typeof LANGUAGES]?: string;
}