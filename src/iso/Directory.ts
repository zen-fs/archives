import { DirectoryRecord } from './DirectoryRecord.js';
import { CLEntry, REEntry } from './entries.js';
import { FileFlags } from './misc.js';

export class Directory extends Map<string, DirectoryRecord> {
	public readonly dotEntry: DirectoryRecord;

	public constructor(protected record: DirectoryRecord) {
		super();
		let i = record.lba;
		let limit = i + record.dataLength;
		if (!(record.fileFlags & FileFlags.Directory)) {
			// Must have a CL entry.
			const cl = record.suEntries.find(e => e instanceof CLEntry);
			if (!cl) throw new ReferenceError('No CL entry');
			i = cl.childDirectoryLba * 2048;
			limit = Infinity;
		}

		const data = new Uint8Array(record.buffer!);

		while (i < limit) {
			const length = data[i];
			// Zero-padding between sectors.
			// Could optimize this to seek to nearest-sector upon seeing a 0.
			if (!length) {
				i++;
				continue;
			}
			const _record = new DirectoryRecord(record.buffer, i);
			_record.rockRidgeOffset = record.rockRidgeOffset;
			const fileName = _record.fileName;
			// Skip '.' and '..' entries.
			if (fileName !== '\u0000' && fileName !== '\u0001' && (!_record.hasRockRidge || !_record.suEntries.filter(e => e instanceof REEntry).length)) {
				this.set(fileName, _record);
			} else if (limit === Infinity) {
				// First entry contains needed data.
				limit = i + _record.dataLength;
			}
			i += _record.length;
		}

		this.dotEntry = new DirectoryRecord(record.buffer, record.lba);
		this.dotEntry.rockRidgeOffset = record.rockRidgeOffset;
	}
}
