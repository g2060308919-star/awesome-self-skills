#!/usr/bin/env python3
"""Verify source-backup-manifest-v1 without changing the archive or source.

Optional --extract-to creates a previously nonexistent directory, only after all
archive members and manifest entries validate. Extraction never follows archive
links, restores only ordinary files/directories/internal symlinks, and verifies
extracted bytes/modes again. Compatible with system Python without tar filters.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import sys
import tarfile

REQUIRED = {
    'SKILL.md', 'package.json', 'package-lock.json',
    'scripts/run-artifacts.mjs', 'scripts/cdp-fetch-proxy.mjs',
    'scripts/lib/mock-scenario.mjs', 'references/workflow.md',
    'references/proxy-protocol.md', 'references/result-model.md',
}
MAX_UNCOMPRESSED = 512 * 1024 * 1024


class InvalidBackup(Exception):
    def __init__(self, code):
        self.code = code


def require(condition, code):
    if not condition:
        raise InvalidBackup(code)


def safe_path(value):
    require(isinstance(value, str) and value and '\\' not in value and '\x00' not in value, 'UNSAFE_PATH')
    require(not value.startswith('/') and not re.match(r'^[A-Za-z]:', value), 'UNSAFE_PATH')
    parts = value.split('/')
    require(all(part not in ('', '.', '..') for part in parts), 'UNSAFE_PATH')
    return value


def digest_file(handle):
    digest = hashlib.sha256()
    for chunk in iter(lambda: handle.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def mode_of(entry):
    value = entry.get('mode')
    require(isinstance(value, str) and re.fullmatch(r'0o[0-7]{3,4}', value), 'INVALID_MANIFEST')
    mode = int(value, 8)
    require(mode <= 0o777, 'UNSAFE_MODE')
    return mode


def member_kind(member):
    if member.isdir():
        return 'directory'
    if member.isfile():
        return 'file'
    if member.issym():
        return 'symlink'
    raise InvalidBackup('UNSAFE_MEMBER_TYPE')


def verify_archive(archive, destination=None):
    archive = Path(archive).absolute()
    if destination is not None:
        destination = Path(destination).absolute()
        require(not os.path.lexists(str(destination)), 'DESTINATION_EXISTS')
        require(destination.parent.is_dir(), 'DESTINATION_PARENT_MISSING')
    with archive.open('rb') as handle:
        archive_sha = digest_file(handle)
    with tarfile.open(str(archive), 'r:*') as tar:
        members = tar.getmembers()
        require(members and len(members) <= 100000, 'INVALID_ARCHIVE')
        require(sum(member.size for member in members) <= MAX_UNCOMPRESSED, 'ARCHIVE_TOO_LARGE')
        indexed = {}
        for member in members:
            name = safe_path(member.name.rstrip('/') if member.isdir() else member.name)
            require(name not in indexed, 'DUPLICATE_MEMBER')
            member_kind(member)
            require(member.mode & ~0o777 == 0, 'UNSAFE_MODE')
            indexed[name] = member
        roots = {name.split('/')[0] for name in indexed}
        require(len(roots) == 1, 'INVALID_LAYOUT')
        root = next(iter(roots))
        require(root in indexed and indexed[root].isdir(), 'INVALID_LAYOUT')
        metadata_names = {root, root + '/source', root + '/manifest.json', root + '/RESTORE.md'}
        require(metadata_names <= set(indexed), 'MISSING_REQUIRED')
        require(indexed[root + '/source'].isdir(), 'INVALID_LAYOUT')
        require(indexed[root + '/manifest.json'].isfile() and indexed[root + '/RESTORE.md'].isfile(), 'INVALID_LAYOUT')
        manifest = json.load(tar.extractfile(indexed[root + '/manifest.json']))
        require(manifest.get('format') == 'source-backup-manifest-v1', 'INVALID_MANIFEST')
        require(isinstance(manifest.get('source'), dict) and isinstance(manifest.get('exclusions'), list), 'INVALID_MANIFEST')
        require(isinstance(manifest.get('entries'), list), 'INVALID_MANIFEST')
        entries = {}
        for entry in manifest['entries']:
            require(isinstance(entry, dict), 'INVALID_MANIFEST')
            relative = safe_path(entry.get('path'))
            require(relative not in entries, 'DUPLICATE_MANIFEST_ENTRY')
            require(entry.get('type') in ('file', 'directory', 'symlink'), 'INVALID_MANIFEST')
            mode_of(entry)
            entries[relative] = entry
        require(REQUIRED <= set(entries), 'MISSING_REQUIRED')
        require(all(entries[name]['type'] == 'file' for name in REQUIRED), 'MISSING_REQUIRED')
        require(any(name.startswith('tests/') and name.endswith('.test.mjs') and entry['type'] == 'file' for name, entry in entries.items()), 'MISSING_REQUIRED')
        expected_members = metadata_names | {root + '/source/' + name for name in entries}
        require(set(indexed) == expected_members, 'MANIFEST_MISMATCH')
        for relative, entry in entries.items():
            member = indexed[root + '/source/' + relative]
            require(member_kind(member) == entry['type'], 'MANIFEST_MISMATCH')
            require(member.mode == mode_of(entry), 'MODE_MISMATCH')
            parent = posixpath.dirname(relative)
            while parent:
                require(parent in entries and entries[parent]['type'] == 'directory', 'UNSAFE_PATH')
                parent = posixpath.dirname(parent)
            if entry['type'] == 'file':
                require(isinstance(entry.get('size'), int) and entry['size'] == member.size, 'HASH_MISMATCH')
                require(entry.get('sha256') == digest_file(tar.extractfile(member)), 'HASH_MISMATCH')
            elif entry['type'] == 'symlink':
                target = entry.get('target', entry.get('link_target'))
                require(isinstance(target, str) and target == member.linkname and '\\' not in target and '\x00' not in target, 'UNSAFE_SYMLINK')
                require(target and not target.startswith('/') and not re.match(r'^[A-Za-z]:', target), 'UNSAFE_SYMLINK')
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(relative), target))
                require(resolved != '..' and not resolved.startswith('../') and resolved in entries, 'UNSAFE_SYMLINK')
                # A link may reference a real member but not another link or its child.
                require(entries[resolved]['type'] in ('file', 'directory'), 'UNSAFE_SYMLINK')
                require(entry.get('sha256') == hashlib.sha256(target.encode()).hexdigest(), 'HASH_MISMATCH')
        restore_hash = manifest.get('metadata', {}).get('RESTORE.md', {}).get('sha256')
        require(restore_hash == digest_file(tar.extractfile(indexed[root + '/RESTORE.md'])), 'HASH_MISMATCH')
        extracted = False
        if destination is not None:
            # Fail before writing anything if the destination exists, including a symlink.
            os.mkdir(str(destination), 0o700)
            directories = [member for member in members if member.isdir()]
            for member in sorted(directories, key=lambda item: len(PurePosixPath(item.name).parts)):
                (destination / member.name).mkdir(mode=0o700)
            for member in members:
                if member.isfile():
                    output = destination / member.name
                    with output.open('xb') as handle:
                        source = tar.extractfile(member)
                        for chunk in iter(lambda: source.read(1024 * 1024), b''):
                            handle.write(chunk)
                    os.chmod(str(output), member.mode)
            # All writes are complete before links are created; no link is a parent.
            for member in members:
                if member.issym():
                    os.symlink(member.linkname, str(destination / member.name))
                    if hasattr(os, 'lchmod'):
                        os.lchmod(str(destination / member.name), member.mode)
            for member in sorted(directories, key=lambda item: len(PurePosixPath(item.name).parts), reverse=True):
                os.chmod(str(destination / member.name), member.mode)
            for name, member in indexed.items():
                output = destination / name
                facts = output.lstat()
                require(stat.S_IMODE(facts.st_mode) == member.mode, 'EXTRACTED_MODE_MISMATCH')
                if member.isfile():
                    require(stat.S_ISREG(facts.st_mode), 'EXTRACTED_TYPE_MISMATCH')
                    with output.open('rb') as handle:
                        require(digest_file(handle) == digest_file(tar.extractfile(member)), 'EXTRACTED_HASH_MISMATCH')
                elif member.issym():
                    require(stat.S_ISLNK(facts.st_mode) and os.readlink(str(output)) == member.linkname, 'EXTRACTED_LINK_MISMATCH')
                else:
                    require(stat.S_ISDIR(facts.st_mode), 'EXTRACTED_TYPE_MISMATCH')
            extracted = True
    return {'ok': True, 'archive': str(archive), 'archive_sha256': archive_sha,
            'source_entries_verified': len(entries), 'archive_members_verified': len(indexed),
            'extracted_verified': extracted, 'extraction_directory': str(destination) if destination else None,
            'source_directory': str(destination / root / 'source') if destination else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('--extract-to', help='Previously nonexistent directory; parent must already exist')
    options = parser.parse_args()
    try:
        result = verify_archive(options.archive, options.extract_to)
    except InvalidBackup as error:
        print(json.dumps({'ok': False, 'error': error.code}))
        return 2
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError):
        print(json.dumps({'ok': False, 'error': 'INVALID_ARCHIVE_OR_IO'}))
        return 2
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
