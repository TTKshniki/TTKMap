function appState() {
    return {

        currentView: 'spaces', 
        lang: 'ru',         
        selectedCity: 'г. Ростов-на-Дону',
        darkMode: false,
        
        activeBuilding: 'A',
        activeFloor: 1,
        selectedCategory: 'all',
        zoomLevel: 1.0,
        cabinetTab: 'favorites',
        adminTab: 'editor',
        
        topSearchQuery: '',
        isSearching: false,

        isOffline: !navigator.onLine,
        toggleOfflineMode() {
            this.isOffline = !this.isOffline;
            this.showNotification(
                this.isOffline 
                    ? (this.lang === 'ru' ? 'Офлайн режим активирован (кэш доступен)' : 'Offline mode activated (cache ready)') 
                    : (this.lang === 'ru' ? 'Онлайн режим восстановлен' : 'Online mode restored')
            );
        },

        user: null,
        authTab: 'login', 
        authForm: {
            name: '',
            email: '',
            password: '',
            role: 'Employee'
        },

        adminPasswordModalOpen: false,
        adminPasswordInput: '',
        
        attemptAdminAccess() {
            if (this.user && this.user.isAdmin) {
                this.currentView = 'admin';
            } else {
                this.adminPasswordModalOpen = true;
            }
        },

        verifyAdminPassword() {
            if (this.adminPasswordInput === 'admin2026') {
                this.user = {
                    name: 'Администратор ТТК',
                    email: 'admin@ttk.ru',
                    role: 'Администратор',
                    isAdmin: true
                };
                this.adminPasswordModalOpen = false;
                this.adminPasswordInput = '';
                this.currentView = 'admin';
                this.showNotification(
                    this.lang === 'ru' 
                        ? 'Доступ администратора успешно предоставлен' 
                        : 'Administrator access successfully granted'
                );
            } else {
                this.showNotification(
                    this.lang === 'ru' 
                        ? 'Неверный пароль администратора (подсказка: admin2026)' 
                        : 'Incorrect admin password (hint: admin2026)'
                );
            }
        },

        favorites: ['plaza', 'expo', 'center', 101, 102],
        
        get favoriteItemsList() {
            let list = [];
            for (let key in this.spacesData) {
                let space = this.spacesData[key];
                if (this.favorites.includes(space.id)) {
                    list.push({
                        id: space.id,
                        name: space.name,
                        desc: space.desc,
                        image: space.image,
                        type: 'space'
                    });
                }
                if (space.pois) {
                    space.pois.forEach(poi => {
                        if (this.favorites.includes(poi.id)) {
                            list.push({
                                id: poi.id,
                                name: poi.name,
                                desc: { 
                                    ru: `Корпус ${poi.building}, Этаж ${poi.floor}`, 
                                    en: `Building ${poi.building}, Floor ${poi.floor}` 
                                },
                                image: poi.image,
                                type: 'poi',
                                parentSpaceKey: key,
                                rawPoi: poi
                            });
                        }
                    });
                }
            }
            return list;
        },

        isFavorite(id) {
            return this.favorites.includes(id);
        },

        toggleFavorite(id, event) {
            if (event) event.stopPropagation();
            if (this.favorites.includes(id)) {
                this.favorites = this.favorites.filter(favId => favId !== id);
                this.showNotification(
                    this.lang === 'ru' ? 'Удалено из избранного' : 'Removed from favorites'
                );
            } else {
                this.favorites.push(id);
                this.showNotification(
                    this.lang === 'ru' ? 'Добавлено в избранное' : 'Added to favorites'
                );
            }
        },

        openFavoriteItem(item) {
            if (item.type === 'space' || this.spacesData[item.id]) {
                this.selectSpaceAndOpenMap(item.id);
            } else if (item.parentSpaceKey) {
                this.currentSpaceKey = item.parentSpaceKey;
                this.selectedPoi = item.rawPoi;
                this.activeBuilding = item.rawPoi.building;
                this.activeFloor = item.rawPoi.floor;
                this.currentView = 'map';
            }
        },

        carouselIndex: 0,
        spaceList: ['plaza', 'expo', 'hotel', 'hub', 'center'],

        activePanoramaPoi: null,
        panoZoom: 100,
        panoRotationX: 0,
        panoRotationY: 0,
        isDraggingPano: false,
        panoStartX: 0,
        panoStartY: 0,

        photoSearchModalOpen: false,
        isCapturingCamera: false,
        capturedFramesCount: 0,

        generatedCanvasMap: null,
        isGeneratingMap: false,
        activeMarkupTool: null,

        routeActive: true,
        routeFrom: '101',
        routeTo: '102',
        selectedPoi: null,

        notificationOpen: false,
        notificationText: '',
        mobileMenuOpen: false,
        chartInstance: null,

        spacesData: spacesData,
        currentSpaceKey: 'plaza',

        get currentSpace() {
            return this.spacesData[this.currentSpaceKey] || this.spacesData['plaza'];
        },

        get t() {
            return i18n[this.lang];
        },

        init() {
            if (this.currentSpace.pois && this.currentSpace.pois.length > 0) {
                this.selectedPoi = this.currentSpace.pois[0];
            }
            
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.darkMode = true;
            }

            window.addEventListener('online', () => { 
                if(!this.isOffline) { this.isOffline = false; } 
            });
            window.addEventListener('offline', () => { 
                this.isOffline = true; 
            });

            this.$watch('currentView', (view) => {
                if (view === 'admin' && this.adminTab === 'analytics') {
                    setTimeout(() => this.initAnalyticsChart(), 150);
                }
                setTimeout(() => lucide.createIcons(), 50);
            });

            this.$watch('darkMode', (val) => {
                if (val) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            });

            this.$watch('adminTab', (tab) => {
                if (tab === 'analytics') {
                    setTimeout(() => this.initAnalyticsChart(), 150);
                }
            });

            setTimeout(() => lucide.createIcons(), 100);
        },

        triggerMetallicFlash(event) {
            const el = event.currentTarget;
            el.classList.add('metallic-flash-active');
            this.showNotification(this.lang === 'ru' ? 'Переход к расширенному поиску ТТК...' : 'Navigating to TTK Advanced Search...');
            setTimeout(() => {
                el.classList.remove('metallic-flash-active');
                this.currentView = 'map';
            }, 800);
        },

        executeTopSearch() {
            if (!this.topSearchQuery || !this.topSearchQuery.trim()) return;
            const query = this.topSearchQuery.toLowerCase().trim();
            let found = false;
            
            for (let key in this.spacesData) {
                const space = this.spacesData[key];
                if (space.name.ru.toLowerCase().includes(query) || space.name.en.toLowerCase().includes(query) || space.desc.ru.toLowerCase().includes(query)) {
                    this.currentSpaceKey = key;
                    found = true;
                    break;
                }
                if (space.pois) {
                    for (let poi of space.pois) {
                        if (poi.name.ru.toLowerCase().includes(query) || poi.name.en.toLowerCase().includes(query) || (poi.equipment && poi.equipment.toLowerCase().includes(query))) {
                            this.currentSpaceKey = key;
                            this.selectedPoi = poi;
                            this.activeBuilding = poi.building;
                            this.activeFloor = poi.floor;
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }
            
            this.currentView = 'map';
            this.showNotification(
                this.lang === 'ru' 
                    ? `Результаты поиска для: "${this.topSearchQuery}"` 
                    : `Search results for: "${this.topSearchQuery}"`
            );
            this.topSearchQuery = '';
        },

        switchLanguage(newLang) {
            this.lang = newLang;
            this.showNotification(
                newLang === 'ru' ? 'Язык изменен на Русский' : 'Language switched to English'
            );
        },

        toggleDarkMode() {
            this.darkMode = !this.darkMode;
        },

        loginUser() {
            if (!this.authForm.email || !this.authForm.password) {
                this.showNotification(
                    this.lang === 'ru' ? 'Пожалуйста, заполните все поля!' : 'Please fill all fields!'
                );
                return;
            }
            this.user = {
                name: this.authForm.name || 'Алексей Шереметьев',
                email: this.authForm.email,
                role: 'Сотрудник ТТК',
                isAdmin: this.authForm.email.includes('admin')
            };
            this.currentView = 'cabinet';
            this.showNotification(
                this.lang === 'ru' ? 'Успешный вход в личный кабинет!' : 'Successfully logged in!'
            );
        },

        registerUser() {
            if (!this.authForm.email || !this.authForm.password || !this.authForm.name) {
                this.showNotification(
                    this.lang === 'ru' ? 'Заполните все поля регистрации!' : 'Fill all registration fields!'
                );
                return;
            }
            this.user = {
                name: this.authForm.name,
                email: this.authForm.email,
                role: this.authForm.role,
                isAdmin: false
            };
            this.currentView = 'cabinet';
            this.showNotification(
                this.lang === 'ru' ? 'Регистрация успешно завершена!' : 'Registration complete!'
            );
        },

        logoutUser() {
            this.user = null;
            this.currentView = 'spaces';
            this.showNotification(
                this.lang === 'ru' ? 'Вы успешно вышли из системы' : 'Successfully logged out'
            );
        },

        prevSpace() {
            this.carouselIndex = (this.carouselIndex - 1 + (this.spaceList.length + 1)) % (this.spaceList.length + 1);
            if(this.carouselIndex < this.spaceList.length) {
                this.currentSpaceKey = this.spaceList[this.carouselIndex];
            }
        },
        
        nextSpace() {
            this.carouselIndex = (this.carouselIndex + 1) % (this.spaceList.length + 1);
            if(this.carouselIndex < this.spaceList.length) {
                this.currentSpaceKey = this.spaceList[this.carouselIndex];
            }
        },

        selectSpaceAndOpenMap(key) {
            this.currentSpaceKey = key;
            this.activeBuilding = 'A';
            this.activeFloor = 1;
            if (this.currentSpace.pois && this.currentSpace.pois.length > 0) {
                this.selectedPoi = this.currentSpace.pois[0];
            }
            this.currentView = 'map';
            this.routeActive = true;
            this.showNotification(
                this.lang === 'ru' ? 'Объект загружен на карту и навигацию' : 'Space loaded to map'
            );
        },

        openSpaceFullPage(key) {
            this.currentSpaceKey = key;
            if (this.currentSpace.pois && this.currentSpace.pois.length > 0) {
                this.selectedPoi = this.currentSpace.pois[0];
                this.activePanoramaPoi = this.selectedPoi;
                this.openPanorama(this.selectedPoi);
            }
        },

        zoomInMap() {
            this.zoomLevel = Math.min(this.zoomLevel + 0.25, 2.5);
        },
        
        zoomOutMap() {
            this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.6);
        },
        
        resetMapZoom() {
            this.zoomLevel = 1.0;
        },

        openPanorama(poi) {
            this.activePanoramaPoi = poi || (this.currentSpace.pois ? this.currentSpace.pois[0] : null);
            this.panoRotationX = 0;
            this.panoRotationY = 0;
            this.panoZoom = 100;
            this.panoramaModalOpen = true;
        },

        startPanoDrag(e) {
            this.isDraggingPano = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            this.panoStartX = clientX - this.panoRotationX;
            this.panoStartY = clientY - this.panoRotationY;
        },

        onPanoDrag(e) {
            if (!this.isDraggingPano) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            this.panoRotationX = (clientX - this.panoStartX);
            this.panoRotationY = Math.max(-120, Math.min(120, (clientY - this.panoStartY)));
        },

        stopPanoDrag() {
            this.isDraggingPano = false;
        },

        startCameraPanorama() {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(() => {
                        this.isCapturingCamera = true;
                        this.capturedFramesCount = 1;
                        this.showNotification(
                            this.lang === 'ru' ? 'Камера активирована. Сделайте 8 круговых кадров.' : 'Camera active. Take 8 shots.'
                        );
                    })
                    .catch(() => {
                        this.showNotification(
                            this.lang === 'ru' ? 'Ошибка доступа к камере устройства' : 'Camera access error'
                        );
                    });
            } else {
                this.showNotification(
                    this.lang === 'ru' ? 'Камера не поддерживается вашим браузером' : 'Camera not supported'
                );
            }
        },

        setMarkupTool(toolName) {
            this.activeMarkupTool = toolName;
            const toolNamesRu = { wall: 'Нарисовать стену', poi: 'Добавить POI', wifi: 'Зона Wi-Fi', entrance: 'Вход/Выход' };
            const toolNamesEn = { wall: 'Draw Wall', poi: 'Add POI', wifi: 'Wi-Fi Zone', entrance: 'Entrance/Exit' };
            const name = this.lang === 'ru' ? toolNamesRu[toolName] : toolNamesEn[toolName];
            this.showNotification(this.lang === 'ru' ? `Инструмент разметки: ${name}` : `Markup Tool: ${name}`);
        },

        handlePhotoUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                    this.photoSearchModalOpen = false;
                    if (this.currentSpace.pois && this.currentSpace.pois.length > 1) {
                        this.selectedPoi = this.currentSpace.pois[1];
                        this.activeFloor = this.selectedPoi.floor;
                    }
                    this.currentView = 'map';
                    this.buildRoute();
                    this.showNotification(
                        this.lang === 'ru' ? 'Объект успешно распознан по фотографии!' : 'Object recognized on photo!'
                    );
                };
                reader.readAsDataURL(file);
            }
        },

        buildRoute() {
            this.routeActive = true;
            this.showNotification(
                this.lang === 'ru' ? 'Маршрут успешно построен на карте!' : 'Route built successfully!'
            );
        },

        clearRoute() {
            this.routeActive = false;
            this.routeFrom = '';
            this.routeTo = '';
            this.showNotification(
                this.lang === 'ru' ? 'Маршрут сброшен' : 'Route cleared'
            );
        },

        initAnalyticsChart() {
            const ctx = document.getElementById('analyticsChart')?.getContext('2d');
            if (!ctx) return;

            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
                    datasets: [{
                        label: this.lang === 'ru' ? 'Посетители (чел/час)' : 'Visitors (people/hr)',
                        data: [140, 480, 920, 1150, 810, 430, 195],
                        borderColor: '#E31B23',
                        backgroundColor: 'rgba(227, 27, 35, 0.12)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#E31B23'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { grid: { color: 'rgba(200, 200, 200, 0.1)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        },

        showNotification(text) {
            this.notificationText = text;
            this.notificationOpen = true;
            setTimeout(() => {
                this.notificationOpen = false;
            }, 3500);
        }
    }
}