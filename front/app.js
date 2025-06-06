// app.js

// 後端 API 根網址
const AUTH_BASE = 'http://127.0.0.1:5001';  // Auth 服務
const API_BASE  = 'http://127.0.0.1:1122';  // Customer Foods 服務

// 建立 axios 實例，自動攜帶 Cookie (Flask Session)
const http = axios.create({
  withCredentials: true
});

// -----------------------
// 1. Login 組件 (只取 template)
// -----------------------
const Login = {
  template: '#login-template',  // 直接引用 <template id="login-template">
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  computed: {
    messageClass() {
      // 如果訊息以「已」開頭，就當作 success，否則 error
      return this.message.startsWith('已') ? 'success' : 'error';
    }
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入使用者名稱與密碼。';
        return;
      }
      try {
        const resp = await http.post(`${AUTH_BASE}/login`, {
          username: this.username,
          password: this.password
        });
        if (resp.data.message === '登入成功') {
          localStorage.setItem('username', this.username);
          this.$router.replace('/');
        }
      } catch (err) {
        this.message = err.response?.data?.error || '登入失敗，請稍後再試。';
      }
    }
  },
  mounted() {
    // 如果有 query.msg (例如註冊成功訊息)，顯示綠字
    const msg = this.$route.query.msg;
    if (msg) {
      this.message = msg;
    }
  }
};

// -----------------------
// 2. Signup 組件 (只取 template)
// -----------------------
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
        this.message = '請輸入使用者名稱與密碼。';
        return;
      }
      try {
        const resp = await http.post(`${AUTH_BASE}/signup`, {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          // 註冊成功後跳回登入頁，並帶 msg
          this.$router.replace({ path: '/login', query: { msg: '已註冊，請重新登入。' } });
        }
      } catch (err) {
        this.message = err.response?.data?.error || '註冊失敗，請稍後再試。';
      }
    }
  }
};

// -----------------------
// 3. Home 組件 (只取 template)
// -----------------------
const Home = {
  template: '#home-template',
  data() {
    return {
      sessionUser: '',
      foods: [],
      form: {
        name: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0
      },
      editing: false,
      editId: null,
      error: ''
    };
  },
  methods: {
    async fetchFoods() {
      try {
        const resp = await http.get(`${API_BASE}/customer-foods`, {
          params: { user_id: this.sessionUser }
        });
        this.foods = resp.data;
      } catch {
        this.error = '取得資料失敗，請確認是否已登入。';
        this.$router.replace('/login');
      }
    },
    async doLogout() {
      try {
        await http.post(`${AUTH_BASE}/logout`);
      } catch (e) {
        console.warn('Logout error:', e);
      }
      localStorage.removeItem('username');
      this.$router.replace('/login');
    },
    startEdit(food) {
      this.editing = true;
      this.editId = food.id;
      this.form = {
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs
      };
    },
    cancelEdit() {
      this.editing = false;
      this.editId = null;
      this.form = { name: '', calories: 0, protein: 0, fat: 0, carbs: 0 };
    },
    async deleteFood(id) {
      if (!confirm('確定要刪除？')) return;
      try {
        await http.delete(`${API_BASE}/customer-foods/${id}`);
        this.fetchFoods();
      } catch {
        this.error = '刪除失敗，請稍後再試。';
      }
    },
    async submitForm() {
      if (!this.editing) {
        // 新增
        try {
          await http.post(`${API_BASE}/customer-foods`, {
            user_id: this.sessionUser,
            name: this.form.name,
            calories: this.form.calories,
            protein: this.form.protein,
            fat: this.form.fat,
            carbs: this.form.carbs
          });
          this.fetchFoods();
          this.form = { name: '', calories: 0, protein: 0, fat: 0, carbs: 0 };
        } catch {
          this.error = '新增失敗，請稍後再試。';
        }
      } else {
        // 更新
        try {
          await http.put(`${API_BASE}/customer-foods/${this.editId}`, {
            name: this.form.name,
            calories: this.form.calories,
            protein: this.form.protein,
            fat: this.form.fat,
            carbs: this.form.carbs
          });
          this.fetchFoods();
          this.cancelEdit();
        } catch {
          this.error = '更新失敗，請稍後再試。';
        }
      }
    }
  },
  async beforeRouteEnter(to, from, next) {
    try {
      const resp = await http.get(`${AUTH_BASE}/whoami`);
      if (resp.data.logged_in) {
        next(vm => {
          vm.sessionUser = resp.data.username;
          vm.fetchFoods();
        });
      } else {
        next('/login');
      }
    } catch {
      next('/login');
    }
  }
};

// -----------------------
// 4. Vue Router 設定
// -----------------------
const routes = [
  { path: '/login',  component: Login },
  { path: '/signup', component: Signup },
  { path: '/',       component: Home }
];
const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  if (to.path === '/login' || to.path === '/signup') {
    return next();
  }
  const stored = localStorage.getItem('username');
  if (!stored) {
    return next('/login');
  }
  next();
});

// -----------------------
// 5. 建立 Vue App 並掛載
// -----------------------
const app = Vue.createApp({
  template: '<router-view></router-view>'
});
app.use(router);
app.mount('#app');

