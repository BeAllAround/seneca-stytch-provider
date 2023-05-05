const Express = require('express')
const BodyParser = require('body-parser')
const Url = require('url')

const Seneca = require('seneca')

const StytchProvider = require('../../')


const start = async () => {
  const app = Express()
  const seneca = await makeSeneca({ legacy: false })
  const port = 3000
  const path = `http://localhost:${port}`

  let plugin_info = await seneca.post('sys:provider,provider:stytch,get:info')

  console.log(plugin_info)

  configureApp(app)
  setUpRoutes(app, seneca, path)
  app.listen(port, () => {
    console.log(`Listening on ${path}`)
  })
}

start()

async function makeSeneca(opts) {
  const seneca = Seneca(opts)
    .test()
    .use('promisify')
    .use('entity')
    .use('env', {
      var: {
        $STYTCH_PROJECTID: String,
        $STYTCH_SECRET: String,
      }
    })
    .use('provider', {
      provider: {
        stytch: {
          keys: {
            project_id: { value: '$STYTCH_PROJECTID' },
            secret: { value: '$STYTCH_SECRET' },
          }
        }
      }
    })
    .use(StytchProvider)
    .use('user')

  await seneca.ready()
  return seneca
}

function setUpRoutes(app, seneca, path) {
  let sdk = seneca.export('StytchProvider/sdk')()

  const magicLinkUrl = `${path}/authenticate`
 
  // an example of using seneca.prior with register:user to extend its functionality
  seneca.message('sys:user,register:user', async function (msg, reply) {
   let params = msg.params || {}

   let result = await sdk.magicLinks.email.loginOrCreate(params)

   let out = await this.prior({ ...msg, email: params.email })
   out.res = result
   return out

  })

  seneca.message('auth:stytch,sys:user', async function (msg, reply) {
    let token = msg.token || ''

    let result = await sdk.magicLinks.authenticate(token)

    return result
  })

  app.get('/', async (req, res) => {
    res.render('loginOrSignUp')
  })

  app.post('/login_or_create_user', async (req, res) => {
    const params = {
      email: req.body.email,
      login_magic_link_url: magicLinkUrl,
      signup_magic_link_url: magicLinkUrl,
    }
    try {
      let result = await seneca.post('sys:user,register:user', { params } )
      res.render('emailSent')
    } catch(err) {
      console.log(err)
      res.render('loginOrSignUp')
    }

  })

  app.get('/authenticate', async (req, res) => {
    const queryObject = Url.parse(req.url, true).query
    try {
      let result = await seneca.post('auth:stytch,sys:user', { token: queryObject.token })
      res.render('loggedIn')
    } catch(err) {
      console.log(err)
      res.render('loginOrSignUp')
    }
  })

}

function configureApp(app) {
  app.use(BodyParser.urlencoded({ extended: true }))
  app.use(Express.static('public'))
  app.set('view engine', 'ejs')
}