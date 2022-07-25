## Running Test Suite

The SimpleIOT test suite uses [PyTest](https://docs.pytest.org/en/latest/contents.html) to perform the API tests.
It uses the same invocation mechanism as the installer. If you are in the process of installing, you can
just continue on.

Otherwise, to start, you need to have the virtualenv activated from the `iotapi` installation directory activated:

```bash
source venv/bin/activate
```

The test invokes the back-end API using the REST APIs. To perform authentication, it
needs the *team name* as well as the username/password of the `admin` user you specified 
during the installation phase.

These are assumed to be set to environment variables `IOT_AUTH_USERNAME` and `IOT_AUTH_PASSWORD`.

```bash
export IOT_AUTH_USERNAME='admin'
export IOT_AUTH_PASSWORD='{your-admin-password}'
```

NOTE: It is recommended you use single-quotes around the environment variables to prevent conflicts with reserved
shell characters.

Once set, you can invoke the test:

```bash
invoke apitest --team {team-name}
```

This will run `pytest` inside the `test` directory. If everything works, you should be getting somethign like:

```bash
invoke apitest --team simpleiot-demo                                                         ─╯
======================================= test session starts ========================================
platform darwin -- Python 3.9.4, pytest-6.1.2, py-1.9.0, pluggy-0.13.1
rootdir: .../iotapi/test
plugins: Faker-4.16.0
collected 8 items

auth/test_01_login_token.py ...                                                              [ 37%]
project/test_02_projects.py .....                                                            [100%]
...
======================================== 27 passed in 126.24s ========================================
```

If any of the tests fail, you should check to make sure the reason before proceeding.
