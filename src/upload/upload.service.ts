import { Injectable } from '@nestjs/common';
import { createWriteStream, unlink, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import * as orignal_ffmpeg from 'fluent-ffmpeg';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { IWhisperQueueJobData } from 'src/whisper/whisper.service';

console.log("orignal_ffmpeg", orignal_ffmpeg);


@Injectable()
export class UploadService {
    constructor(
        @InjectQueue('whisper-queue') private whisperQueue: Queue<IWhisperQueueJobData>
    ) {
        console.log('UploadService');
    }

    async saveRecordFile(file) {
        const filename = `${Date.now()}-${file.originalname}`;
        const dirPath = `${__dirname}/records`;
        const sourceFile = path.join(dirPath, filename);

        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }

        await new Promise<void>((resolve, reject) => {
            createWriteStream(sourceFile).write(file.buffer, (error) => {
                if (error) {
                    console.error('Failed to save source file', error);
                    reject(error);
                }

                console.log('write finish');
                resolve();
            });
        })

        console.log('start add job');
        const job = await this.whisperQueue.add({ sourceFile });

        console.log('wait job finish');
        return await job.finished();
    }
}