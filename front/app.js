// app.js

const AUTH_BASE   = 'http://127.0.0.1:5001';
const API_BASE    = 'http://127.0.0.1:1122';
const RECORD_BASE = 'http://127.0.0.1:1133';

// 建立 axios 實例，自動攜帶 Cookie（Session）
const httpAuth   = axios.create({ baseURL: AUTH_BASE,   withCredentials: true });
const httpFood   = axios.create({ baseURL: API_BASE,    withCredentials: true });
const httpRecord = axios.create({ baseURL: RECORD_BASE, withCredentials: true });

// 1. 公共 Mixin：判斷目前是否登入，用在 header 登出按鈕顯示
const globalMixin = {
  data() {
    return {
      isLoggedIn: !!localStorage.getItem('username')
    };
  },
  methods: {
    async doLogout() {
      await httpAuth.post('/logout').catch(() => {});
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      this.isLoggedIn = false;
      this.$router.replace('/login');
    }
  }
};

// ------- 2. Login 組件 -------
const Login = {
  template: '#login-template',
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/login', {
          username: this.username,
          password: this.password
        });
        if (resp.data.message === '登入成功') {
          // 取得 whoami（user_id + username）
          const who = await httpAuth.get('/whoami');
          if (who.data.logged_in) {
            localStorage.setItem('userId', who.data.user_id);
            localStorage.setItem('username', who.data.username);
            this.$root.isLoggedIn = true;
            this.$router.replace('/');
            return;
          }
        }
        this.message = '登入失敗';
      } catch (err) {
        this.message = err.response?.data?.error || '網路錯誤，請稍後再試。';
      }
    }
  }
};

// ------- 3. Signup 組件 -------
const Signup = {
  template: '#signup-template',
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doSignup() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/signup', {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          this.$router.replace({ path: '/login', query: { msg: '已註冊，請重新登入。' } });
          return;
        }
      } catch (err) {
        if (err.response && err.response.status === 409) {
          this.message = '此使用者名稱已被註冊。';
        } else {
          this.message = err.response?.data?.error || '註冊失敗，請稍後再試。';
        }
      }
    }
  },
  mounted() {
    const msg = this.$route.query.msg;
    if (msg) this.message = msg;
  }
};

// ------- 4. Dashboard（首頁）組件 -------
const Dashboard = {
  mixins: [globalMixin],
  template: '#dashboard-template',
  data() {
    return {
      today: new Date(),
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      todayIndex: null,
      todayFormatted: '',
      todayRecords: [],
      records: [],
      todayCalories: 0,
      calorieRatio: 0,    // 用於畫圓形進度 (0～1)
      progressColor: '#4caf50',
      error: '',

      // 加上：官方食物和自訂食物的 map，以便顯示「食物名稱」
      officialFoods: [],
      customFoods: []
    };
  },
  methods: {
    formatDateTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return `${hh}:${mi}`;
    },
    async fetchData() {
      try {
        // 1. 確認登入
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const uid = who.data.user_id;

        // 2. 同步撈官方、自訂食物列表（用於顯示名稱）
        const [ofResp, cfResp] = await Promise.all([
          httpRecord.get('/official-foods'),
          httpFood.get('/customer-foods', { params: { user_id: uid } })
        ]);
        this.officialFoods = ofResp.data;
        this.customFoods = cfResp.data;

        // 3. 拿全部紀錄並排序
        const recResp = await httpRecord.get('/diet-records');
        this.records = recResp.data.sort((a,b) => (new Date(b.record_time)) - (new Date(a.record_time)));

        // 4. 計算「今天範圍」(YYYY-MM-DD)
        const yyyy = this.today.getFullYear();
        const mm = String(this.today.getMonth()+1).padStart(2,'0');
        const dd = String(this.today.getDate()).padStart(2,'0');
        const todayPrefix = `${yyyy}-${mm}-${dd}`;

        // 5. 篩出 todayRecords
        this.todayRecords = this.records.filter(r => r.record_time.startsWith(todayPrefix));

        // 6. 計算 todayCalories
        this.todayCalories = this.todayRecords.reduce((sum,r) => sum + r.calorie_sum, 0);

        // 7. 進度 (目標 2000kcal，可自行調整)
        const goal = 2000;
        this.calorieRatio = Math.min(this.todayCalories / goal, 1);

        // 8. 計算今天星期索引
        let dow = this.today.getDay(); // 0 ~ 6, Sunday=0
        this.todayIndex = (dow === 0) ? 6 : (dow - 1);

        // 9. 格式化今天日期 "YYYY-MM-DD"
        this.todayFormatted = `${yyyy}-${mm}-${dd}`;

      } catch {
        this.error = '讀取資料失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    goToAllRecords() {
      this.$router.push('/all-records');
    },
    goToCustomFoods() {
      this.$router.push('/custom-foods');
    },
    goToAddRecord() {
      this.$router.push('/add-record');
    },
    // 用來顯示「食物名稱: X kcal, Y g 碳水, Z g 蛋白, W g 脂肪」
    getRecordLabel(r) {
      let name = '未知';
      let cal = r.calorie_sum;
      let carb = r.carb_sum;
      let pro = r.protein_sum;
      let fat = r.fat_sum;

      if (r.official_food_id) {
        const of = this.officialFoods.find(x => x.id === r.official_food_id);
        if (of) name = of.name;
      } else if (r.custom_food_id) {
        const cf = this.customFoods.find(x => x.id === r.custom_food_id);
        if (cf) name = cf.name;
      } else if (r.manual_name) {
        name = r.manual_name;
      }

      return `${name}：${cal} kcal, ${carb} g 碳水, ${pro} g 蛋白, ${fat} g 脂肪`;
    }
  },
  mounted() {
    this.fetchData();
  },
  computed: {
    // 計算圓圈周長，用來 stroke-dasharray
    circumference() {
      const radius = 54;
      return 2 * Math.PI * radius;
    }
  }
};

// ------- 5. Add Record（新增飲食紀錄）組件 -------
const AddRecord = {
  mixins: [globalMixin],
  template: '#add-record-template',
  data() {
    return {
      officialFoods: [],
      customFoods: [],
      inputMode: 'official',
      form: {
        official_food_id: null,
        custom_food_id: null,
        manual_name: '',
        record_time: '',
        calorie_sum: 0,
        carb_sum: 0,
        protein_sum: 0,
        fat_sum: 0
      },
      error: ''
    };
  },
  methods: {
    async fetchFoods() {
      try {
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const uid = who.data.user_id;
        const [ofResp, cfResp] = await Promise.all([
          httpRecord.get('/official-foods'),
          httpFood.get('/customer-foods', { params: { user_id: uid } })
        ]);
        this.officialFoods = ofResp.data;
        this.customFoods = cfResp.data;
      } catch {
        this.error = '讀取食物列表失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    onOfficialChange() {
      const of = this.officialFoods.find(x => x.id === this.form.official_food_id);
      if (of) {
        this.form.calorie_sum = of.calories;
        this.form.carb_sum = of.carbs;
        this.form.protein_sum = of.protein;
        this.form.fat_sum = of.fat;
      }
      this.form.custom_food_id = null;
      this.form.manual_name = '';
    },
    onCustomChange() {
      const cf = this.customFoods.find(x => x.id === this.form.custom_food_id);
      if (cf) {
        this.form.calorie_sum = cf.calories;
        this.form.carb_sum = cf.carbs;
        this.form.protein_sum = cf.protein;
        this.form.fat_sum = cf.fat;
      }
      this.form.official_food_id = null;
      this.form.manual_name = '';
    },
    async submitRecord() {
      if (!this.form.record_time) {
        this.error = '請選擇時間';
        return;
      }
      // 轉成 "YYYY-MM-DD HH:MM:SS"
      const dtFormatted = this.form.record_time.replace('T', ' ') + ':00';
      const payload = {
        record_time: dtFormatted,
        calorie_sum: this.form.calorie_sum,
        carb_sum: this.form.carb_sum,
        protein_sum: this.form.protein_sum,
        fat_sum: this.form.fat_sum
      };
      if (this.inputMode === 'official') {
        payload.official_food_id = this.form.official_food_id;
      } else if (this.inputMode === 'custom') {
        payload.custom_food_id = this.form.custom_food_id;
      } else if (this.inputMode === 'manual') {
        payload.official_food_id = null;
        payload.custom_food_id = null;
        payload.manual_name = this.form.manual_name;
      }
      try {
        await httpRecord.post('/diet-records', payload);
        this.$router.replace('/');
      } catch {
        this.error = '新增失敗，請稍後再試。';
      }
    }
  },
  mounted() {
    this.fetchFoods();
  }
};

// ------- 6. All Records（完整列表）組件 -------
const AllRecords = {
  mixins: [globalMixin],
  template: '#all-records-template',
  data() {
    return {
      records: [],
      officialFoods: [],
      customFoods: [],
      error: ''
    };
  },
  methods: {
    formatDateTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth()+1).padStart(2,'0');
      const dd = String(dt.getDate()).padStart(2,'0');
      const hh = String(dt.getHours()).padStart(2,'0');
      const mi = String(dt.getMinutes()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    },
    async fetchAll() {
      try {
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const uid = who.data.user_id;
        const [ofResp, cfResp, recResp] = await Promise.all([
          httpRecord.get('/official-foods'),
          httpFood.get('/customer-foods', { params: { user_id: uid } }),
          httpRecord.get('/diet-records')
        ]);
        this.officialFoods = ofResp.data;
        this.customFoods = cfResp.data;
        this.records = recResp.data.sort((a,b) => (new Date(b.record_time)) - (new Date(a.record_time)));
      } catch {
        this.error = '讀取失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    getRecordLabel(r) {
      let name = '未知';
      let cal = r.calorie_sum;
      let carb = r.carb_sum;
      let pro = r.protein_sum;
      let fat = r.fat_sum;

      if (r.official_food_id) {
        const of = this.officialFoods.find(x => x.id === r.official_food_id);
        if (of) name = of.name;
      } else if (r.custom_food_id) {
        const cf = this.customFoods.find(x => x.id === r.custom_food_id);
        if (cf) name = cf.name;
      } else if (r.manual_name) {
        name = r.manual_name;
      }

      return `${name}：${cal} kcal, ${carb} g 碳水, ${pro} g 蛋白, ${fat} g 脂肪`;
    }
  },
  mounted() {
    this.fetchAll();
  }
};

// ------- 7. Custom Foods（自訂食物）組件 -------
const CustomFoods = {
  mixins: [globalMixin],
  template: '#custom-foods-template',
  data() {
    return {
      foods: [],
      error: ''
    };
  },
  methods: {
    async fetchFoods() {
      try {
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        const uid = who.data.user_id;
        const resp = await httpFood.get('/customer-foods', { params: { user_id: uid } });
        this.foods = resp.data;
      } catch {
        this.error = '讀取失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    getFoodLabel(f) {
      const name = f.name;
      const cal = f.calories;
      const pro = f.protein;
      const fat = f.fat;
      const carb = f.carbs;
      return `${name}：${cal} kcal, ${carb} g 碳水, ${pro} g 蛋白, ${fat} g 脂肪`;
    },
    goToAddFood() {
      this.$router.push('/add-food');
    }
  },
  mounted() {
    this.fetchFoods();
  }
};

// ------- 8. Add Food（新增自訂食物）組件 -------
const AddFood = {
  mixins: [globalMixin],
  template: '#add-food-template',
  data() {
    return {
      form: {
        name: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0
      },
      error: ''
    };
  },
  methods: {
    async submitFood() {
      if (!this.form.name) {
        this.error = '請輸入食物名稱';
        return;
      }
      try {
        await httpFood.post('/customer-foods', {
          user_id: localStorage.getItem('userId'),
          name:    this.form.name,
          calories:this.form.calories,
          protein: this.form.protein,
          fat:     this.form.fat,
          carbs:   this.form.carbs
        });
        this.$router.replace('/custom-foods');
      } catch (err) {
        if (err.response && err.response.status === 400) {
          this.error = '請補齊所有欄位';
        } else if (err.response && err.response.status === 409) {
          this.error = '同名自訂食物已存在';
        } else {
          this.error = '新增失敗，請稍後再試。';
        }
      }
    }
  }
};

// ------- 9. Vue Router 設定 -------
const routes = [
  { path: '/login',        component: Login },
  { path: '/signup',       component: Signup },
  { path: '/',             component: Dashboard },
  { path: '/add-record',   component: AddRecord },
  { path: '/all-records',  component: AllRecords },
  { path: '/custom-foods', component: CustomFoods },
  { path: '/add-food',     component: AddFood }
];
const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});
router.beforeEach((to, from, next) => {
  // login/signup 不需檢查
  if (to.path === '/login' || to.path === '/signup') {
    return next();
  }
  // 其他路由，若 localStorage 裡沒有 username，就跳到 /login
  if (!localStorage.getItem('username')) {
    return next('/login');
  }
  next();
});

// ------- 10. 建立 Vue App 並掛載 -------
const app = Vue.createApp({});
app.mixin(globalMixin);
app.use(router);
app.mount('#app');

