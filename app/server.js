const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const app = express();
const PORT = 3000;
const CONFIG_DIR = '/config';

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Функция для проверки, содержит ли YAML-файл раздел services
function hasServicesSection(yamlData) {
  return (Array.isArray(yamlData) && yamlData.length > 0) ||
         (yamlData.services && Array.isArray(yamlData.services));
}

// Функция для чтения и парсинга YAML файла
function loadYaml(filepath) {
  try {
    const fileContents = fs.readFileSync(filepath, 'utf8');
    return yaml.load(fileContents) || {};
  } catch (error) {
    console.error(`Error loading ${filepath}:`, error.message);
    return {};
  }
}

// Функция для получения всех YAML файлов в директории
function getYamlFiles(dir) {
  const files = fs.readdirSync(dir);
  return files.filter(file => path.extname(file).toLowerCase() === '.yaml' ||
                            path.extname(file).toLowerCase() === '.yml');
}

// Функция для извлечения сервисов из YAML данных
function extractServices(yamlData, filename) {
  let services = [];

  if (Array.isArray(yamlData)) {
    // Если данные - массив, предполагаем, что это массив сервисов
    services = yamlData;
  } else if (yamlData.services && Array.isArray(yamlData.services)) {
    // Если данные содержат ключ services с массивом
    services = yamlData.services;
  } else {
    // Если это объект с ключами-именами сервисов
    services = Object.entries(yamlData).map(([key, value]) => ({
      name: key,
      ...value
    }));
  }

  return services;
}

// API endpoint для получения конфига
app.get('/api/config', (req, res) => {
  try {
    // Сначала получаем список всех YAML файлов в конфиг-директории
    const yamlFiles = getYamlFiles(CONFIG_DIR);

    let allServices = [];
    let configData = {};

    // Для каждого YAML файла проверяем, есть ли в нем раздел services
    for (const filename of yamlFiles) {
      const filepath = path.join(CONFIG_DIR, filename);
      const yamlData = loadYaml(filepath);

      if (hasServicesSection(yamlData)) {
        // Извлекаем сервисы из файлов, содержащих секцию services
        const services = extractServices(yamlData, filename);
        allServices = allServices.concat(services);
      } else if (filename === 'config.yaml') {
        // Только для config.yaml сохраняем как настройки групп
        configData = yamlData;
      }
    }

    // Парсим config.yaml (может быть массивом групп или объект с groups ключом)
    let groups = [];
    if (Array.isArray(configData)) {
      groups = configData;
    } else if (configData.groups && Array.isArray(configData.groups)) {
      groups = configData.groups;
    } else {
      // Если это объект с ключами-названиями групп
      groups = Object.entries(configData).map(([key, value]) => {
        if (Array.isArray(value)) {
          // Если значение - массив групп
          return {
            category: key,
            items: value
          };
        } else {
          // Если это отдельная группа
          return {
            name: key,
            ...value
          };
        }
      });
    }

    // Фильтрация и обработка сервисов - добавляем значения по умолчанию для отсутствующих полей
    const processedServices = allServices.map(service => {
      // Убедимся, что у каждого сервиса есть необходимые поля
      const processedService = {
        name: service.name || 'Unnamed Service',
        url: service.url || '#',
        description: service.description || '',
        icon: service.icon || null,
        tags: Array.isArray(service.tags) ? service.tags : (service.tags ? [service.tags] : [])
      };

      // Добавляем все дополнительные поля
      Object.keys(service).forEach(key => {
        if (!processedService.hasOwnProperty(key)) {
          processedService[key] = service[key];
        }
      });

      return processedService;
    }).filter(s => s && s.name); // Фильтруем только те, у которых есть имя

    res.json({
      services: processedServices,
      groups: groups.filter(g => g && (g.name || g.category))
    });
  } catch (error) {
    console.error('Error in /api/config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
  console.log(`Config directory: ${CONFIG_DIR}`);
});