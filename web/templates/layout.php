<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= isset($pageTitle) ? htmlspecialchars($pageTitle) . ' – GarrisonOS' : 'GarrisonOS Property Management' ?></title>
    <link rel="stylesheet" href="/public/css/style.css">
    <script src="/public/js/app.js" defer></script>
</head>
<body>
    <div class="app-container">
        <?php require __DIR__ . '/sidebar.php'; ?>
        <div class="main-content">
            <?php require __DIR__ . '/header.php'; ?>
            <main class="page-body">
                <?php require __DIR__ . '/flash.php'; ?>
                <?= $pageContent ?? '' ?>
            </main>
        </div>
    </div>
</body>
</html>
