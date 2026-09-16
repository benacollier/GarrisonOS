<?php

/**
 * Return the canonical application version from the repository VERSION file.
 */
function application_version(): string {
    $versionPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'VERSION';
    $version = file_get_contents($versionPath);
    if ($version === false || trim($version) === '') {
        throw new RuntimeException('VERSION file is missing or empty');
    }
    return trim($version);
}
