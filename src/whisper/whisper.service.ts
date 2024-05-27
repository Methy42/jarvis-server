import { Injectable } from '@nestjs/common';
import { existsSync, unlink } from 'fs';
import * as path from 'path';
import { IFlagTypes, ITranscriptItem, LANGS, createCppCommand, whisperOutputToArray } from './whisper.base';
import * as shell from 'shelljs';
import { type ChildProcess } from 'child_process';
import { DoneCallback, Job, Queue } from 'bull';
import * as orignal_ffmpeg from 'fluent-ffmpeg';
import { InjectQueue } from '@nestjs/bull';

interface IShellOptions {
    silent?: boolean,
    async?: boolean
}

interface IOptions {
    modelPath: string, // custom path for model
    gpuEnabled: boolean,
    coremlEnabled: boolean,
    whisperOptions: IFlagTypes
    shellOptions?: IShellOptions
}

shell.config.execPath = String(shell.which('node') || shell.which('nodejs'));

export type ITranscriptData = {
    type: 'start';
    taskId: number;
} | {
    type: 'success';
    taskId: number;
} | {
    type: 'data';
    value: ITranscriptItem[];
    taskId: number;
} | {
    type: 'error';
    errno: string;
    taskId?: number;
} | {
    type: 'detectedLang';
    language: keyof LANGS | 'zh';
    taskId: number;
} | {
    type: 'abort';
    errno: string;
    taskId: number;
}

interface IGetTranscriptRes {
    childProcess: ChildProcess;
}

export interface IWhisperQueueJobData { sourceFile: string; }

@Injectable()
export class WhisperService {
    constructor(
        @InjectQueue('whisper-queue') private whisperQueue: Queue<IWhisperQueueJobData>
    ) { 
        this.whisperQueue.process(this.handleQueueJob.bind(this));
    }

    async handleQueueJob(job: Job<IWhisperQueueJobData>, done: DoneCallback) {
        if (!existsSync(job.data.sourceFile)) {
            done(null, []);
            return;
        }

        const outFile = job.data.sourceFile + '.wav';

        await new Promise<void>((resolve, reject) => {
            orignal_ffmpeg(job.data.sourceFile)
                .noVideo()
                .audioCodec('pcm_s16le')
                .audioFrequency(16000)
                .audioChannels(1)
                .output(outFile)
                .on('start', (commandLine: string) => {
                    console.log('start: ', commandLine);
                })
                .on('error', (err: Error, _stdout: string, _stderr: string) => {
                    console.error('Cannot process video: ', err.message, err);
                    reject();
                })
                .on('end', async (stdout: string, _stderr: string) => {
                    console.log('Transcoding succeeded !');
                    console.log(stdout);

                    resolve();
                })
                .run();;
        });

        const result = await new Promise<ITranscriptItem[][]>((resolve, reject) => {
            const result: ITranscriptItem[][] = [];

            this.getTranscript(outFile, (data) => {
                switch (data.type) {
                    case 'abort':
                    case 'success':
                        resolve(result);

                        unlink(job.data.sourceFile, () => { });
                        unlink(outFile, () => { });
                        break;
                    case 'data':
                        result.push(data.value);
                        break;
                }
            }, {
                modelPath: path.join(__dirname, '../..', 'whisper.cpp', 'models', 'ggml-tiny.bin'),
                gpuEnabled: true,
                coremlEnabled: false,
                whisperOptions: {
                    language: 'zh',
                    prompt: '简体中文，关键字:贾维斯'
                }
            });
        })

        done(null, result);
    }

    async getTranscript(filePath: string, onData: (data: ITranscriptData) => void, options?: IOptions) {
        try {
            console.log(`getTranscript start: ${filePath}`);

            const command = createCppCommand({
                filePath: path.normalize(filePath),
                modelPath: options?.modelPath,
                coremlEnabled: options?.coremlEnabled,
                gpuEnabled: options?.gpuEnabled,
                options: options?.whisperOptions
            });

            console.log(`whisper command: ${command}`);

            const finalShellOptions = {
                silent: true,
                async: true,
                ...options?.shellOptions,
            };

            console.log(`command: ${command}`);
            // docs: https://github.com/shelljs/shelljs#execcommand--options--callback
            const child = shell.exec(
                command,
                finalShellOptions,
                (code: number, stdout: string, stderr: string) => {
                    console.log(`shell exec callback, code: ${code}`);
                    if (code === 0) {
                        onData({
                            type: 'success',
                            taskId: 0, // temp value
                        });
                    } else {
                        console.log(`shell exec callback, stdout: ${stdout}`);
                        console.error(`shell exec callback, stderr: ${stderr}`);
                        onData({
                            type: 'error',
                            errno: 'ERROR_WHISPER_CALL',
                            taskId: 0, // temp value
                        });
                    }
                }
            );

            onData({
                type: 'start',
                taskId: 0, // temp value
            });

            // https://stackoverflow.com/questions/10232192/exec-display-stdout-live
            child.stdout!.on('data', (data: Buffer) => {
                const strData = data.toString();

                const value = whisperOutputToArray(strData);
                if (value.length) { // data might be '\n', which leads value to be []
                    onData({
                        type: 'data',
                        value,
                        taskId: 0, // temp value
                    });
                }
            });
            child.stderr!.on('data', (data: Buffer) => {
                const str = data.toString();
                console.error(`stderr: ${str}`);
                const result = /language: (.+) \(p = /.exec(str);
                if (result) {
                    const detectedLang = result[1] as keyof LANGS | 'zh';
                    console.log('detectedLang: ', detectedLang);
                    onData({
                        type: 'detectedLang',
                        language: detectedLang,
                        taskId: 0, // temp value
                    });
                }
            });
            child.on('error', (err) => {
                console.error('whisper error event');
                console.error(err);
            });
            child.on('close', (code, signal) => {
                console.log(`whisper close event: ${code}`, signal);
            });
            child.on('exit', (code) => {
                console.log(`whisper exit event: ${code}`);
            });

            return {
                childProcess: child,
            };
        } catch (e: any) {
            console.log(`Error getting transcript: ${e && e.stack}`);
            throw e;
        }
    }
}