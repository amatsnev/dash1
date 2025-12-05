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

// API endpoint для добавления нового сервиса в services.yaml
app.post('/api/services', (req, res) => {
  try {
    const { name, url, description, icon, tags } = req.body;

    // Валидация обязательных полей
    if (!name || !url) {
      return res.status(400).json({ error: 'Поля name и url обязательны' });
    }

    const newService = {
      name: name,
      url: url,
      description: description || '',
      icon: icon || null,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : [])
    };

    // Путь к файлу services.yaml
    const servicesFilePath = path.join(CONFIG_DIR, 'services.yaml');

    // Загружаем существующие данные из services.yaml
    let existingData = [];
    if (fs.existsSync(servicesFilePath)) {
      const fileContent = fs.readFileSync(servicesFilePath, 'utf8');
      if (fileContent.trim()) {
        existingData = yaml.load(fileContent);
        if (!existingData || typeof existingData !== 'object') {
          existingData = { services: [] };
        }
      } else {
        existingData = { services: [] };
      }
    } else {
      existingData = { services: [] };
    }

    // Если структура не массив, а объект с полем services, то добавляем туда
    if (existingData.services && Array.isArray(existingData.services)) {
      // Проверяем, не существует ли уже сервис с таким именем
      const existingServiceIndex = existingData.services.findIndex(s => s.name === name);
      if (existingServiceIndex > -1) {
        return res.status(400).json({ error: 'Сервис с таким именем уже существует' });
      }

      existingData.services.push(newService);
    } else if (Array.isArray(existingData)) {
      // Если структура сразу массив сервисов
      const existingServiceIndex = existingData.findIndex(s => s.name === name);
      if (existingServiceIndex > -1) {
        return res.status(400).json({ error: 'Сервис с таким именем уже существует' });
      }

      existingData.push(newService);
    } else {
      // Если структура другая, создаем с пустым массивом services
      existingData = { services: [newService] };
    }

    // Сохраняем обновленные данные в файл
    const yamlString = yaml.dump(existingData, { lineWidth: -1 });
    fs.writeFileSync(servicesFilePath, yamlString, 'utf8');

    console.log(`Сервис "${name}" добавлен в services.yaml`);
    res.status(200).json({ message: 'Сервис успешно добавлен', service: newService });
  } catch (error) {
    console.error('Error adding service:', error);
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