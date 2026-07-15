import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const WORKSPACE_CLOSEOUT_SCHEMA = 'zj-loop.workspace_closeout.v1';
export const WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE = 'ACCEPT_LOCAL_REVIEW_ARTIFACT';
export async function closeoutWorkspaceReview(input) {
    const id = sanitizeId(input.orchestrationId);
    const carrierPath = `zj-loop/requests/${id}.json`;
    const archivePath = `zj-loop/archive/requests/${id}.json`;
    const reviewManifestPath = `zj-loop/reviews/${id}/changed-files.json`;
    const closeoutRecordPath = `zj-loop/closeouts/${id}.json`;
    const reviewExists = await exists(input.root, reviewManifestPath);
    const carrierExists = await exists(input.root, carrierPath);
    const archiveExists = await exists(input.root, archivePath);
    if (!reviewExists) {
        return writeCloseoutRecord(input.root, closeoutRecordPath, {
            schema: WORKSPACE_CLOSEOUT_SCHEMA,
            schema_version: 1,
            orchestration_id: input.orchestrationId,
            status: 'resumable',
            carrier_path: carrierPath,
            review_manifest_path: reviewManifestPath,
            closeout_record_path: closeoutRecordPath,
            reason: 'missing-workspace-review-manifest',
            resume_command: resumeCommand(input.orchestrationId),
            updated_at: input.now,
        });
    }
    if (archiveExists && !carrierExists) {
        return writeCloseoutRecord(input.root, closeoutRecordPath, {
            schema: WORKSPACE_CLOSEOUT_SCHEMA,
            schema_version: 1,
            orchestration_id: input.orchestrationId,
            status: 'completed',
            carrier_path: carrierPath,
            archive_path: archivePath,
            review_manifest_path: reviewManifestPath,
            closeout_record_path: closeoutRecordPath,
            reason: 'workspace-closeout-already-completed',
            updated_at: input.now,
        });
    }
    if (!carrierExists) {
        return writeCloseoutRecord(input.root, closeoutRecordPath, {
            schema: WORKSPACE_CLOSEOUT_SCHEMA,
            schema_version: 1,
            orchestration_id: input.orchestrationId,
            status: 'resumable',
            carrier_path: carrierPath,
            review_manifest_path: reviewManifestPath,
            closeout_record_path: closeoutRecordPath,
            reason: 'missing-workspace-activation-carrier',
            resume_command: resumeCommand(input.orchestrationId),
            updated_at: input.now,
        });
    }
    if (input.confirmation !== WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE) {
        return writeCloseoutRecord(input.root, closeoutRecordPath, {
            schema: WORKSPACE_CLOSEOUT_SCHEMA,
            schema_version: 1,
            orchestration_id: input.orchestrationId,
            status: 'resumable',
            carrier_path: carrierPath,
            review_manifest_path: reviewManifestPath,
            closeout_record_path: closeoutRecordPath,
            reason: 'workspace-review-acceptance-required',
            resume_command: resumeCommand(input.orchestrationId),
            updated_at: input.now,
        });
    }
    await mkdir(path.dirname(path.resolve(input.root, archivePath)), { recursive: true });
    await rename(path.resolve(input.root, carrierPath), path.resolve(input.root, archivePath));
    return writeCloseoutRecord(input.root, closeoutRecordPath, {
        schema: WORKSPACE_CLOSEOUT_SCHEMA,
        schema_version: 1,
        orchestration_id: input.orchestrationId,
        status: 'completed',
        carrier_path: carrierPath,
        archive_path: archivePath,
        review_manifest_path: reviewManifestPath,
        closeout_record_path: closeoutRecordPath,
        reason: 'workspace-review-accepted-and-carrier-archived',
        updated_at: input.now,
    });
}
async function writeCloseoutRecord(root, relativePath, record) {
    const target = path.resolve(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(record, null, 2)}\n`);
    const { schema_version: _schemaVersion, updated_at: _updatedAt, ...result } = record;
    return result;
}
function resumeCommand(orchestrationId) {
    return [
        'zj-loop-workspace-closeout',
        '--orchestration',
        orchestrationId,
        '--confirm',
        WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE,
    ];
}
async function exists(root, relativePath) {
    try {
        await readFile(path.resolve(root, relativePath));
        return true;
    }
    catch {
        return false;
    }
}
function sanitizeId(value) {
    return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
